import type { PrismaClient, Prisma } from "../../app/generated/prisma/client";

// 各超时相互匹配：
// - lock_timeout / statement_timeout 是数据库单语句层面的保护；
// - DB_TX_TIMEOUT 是 Prisma 交互式事务的总体保护；
// - SETTLE_TIMEOUT 是测试等待「原始事务真正 settle」的保护，必须大于 DB_TX_TIMEOUT。
export const LOCK_TIMEOUT_MS = 8000;
export const STATEMENT_TIMEOUT_MS = 12000;
export const DB_TX_TIMEOUT = 15000;
export const SETTLE_TIMEOUT = 20000;
export const TX_TIMEOUT = 10000;
export const OBSERVE_TIMEOUT = 4000;
export const OBSERVE_QUERY_TIMEOUT = 2000;

// 标记「withTimeout 包装器超时」：此时原始事务可能仍在运行，不能视为已结束。
export class TransactionTimeoutError extends Error {}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 有界等待：到期用明确的 label 抛错；settled 后清除定时器。
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`超时: ${label}`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export function makeBarrier(): {
  locked: Promise<void>;
  release: () => void;
  afterLock: () => Promise<void>;
} {
  let lockedResolve!: () => void;
  let releaseResolve!: () => void;
  const locked = new Promise<void>((r) => (lockedResolve = r));
  const released = new Promise<void>((r) => (releaseResolve = r));
  return {
    locked,
    release: () => releaseResolve(),
    afterLock: () => {
      lockedResolve();
      return released;
    },
  };
}

export function makeLatch(): { wait: () => Promise<void>; signal: () => void } {
  let resolve!: () => void;
  const p = new Promise<void>((r) => (resolve = r));
  return { wait: () => p, signal: () => resolve() };
}

export async function backendPid(tx: Prisma.TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
  return Number(rows[0].pid);
}

async function setTxTimeouts(tx: Prisma.TransactionClient): Promise<void> {
  // SET 不接受绑定参数，这里用常量字符串内联（数值由上面的常量派生）。
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
  await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);
}

// 观察连接上判断 blockedPid 是否正被 blockerPid 阻塞；单次查询有明确超时。
export async function isBlockedBy(
  observer: PrismaClient,
  blockedPid: number,
  blockerPid: number
): Promise<boolean> {
  const rows = await withTimeout(
    observer.$queryRaw<Array<{ blocker: number }>>`
      SELECT unnest(pg_blocking_pids(${blockedPid})) AS blocker
    `,
    OBSERVE_QUERY_TIMEOUT,
    "观察阻塞查询"
  );
  return rows.some((r) => Number(r.blocker) === blockerPid);
}

// 有界轮询，直到观察到 blockedPid 被 blockerPid 阻塞；超时返回 false（由调用方判失败）。
// 单次观察查询报错按「本次未观察到」继续，循环仍有总截止时间，不挂起。
export async function waitForBlock(
  observer: PrismaClient,
  blockedPid: number,
  blockerPid: number,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await isBlockedBy(observer, blockedPid, blockerPid)) return true;
    } catch {
      // 继续轮询；总截止时间由 deadline 控制。
    }
    await sleep(20);
  }
  return false;
}

export type OverlapOutcome = {
  first: PromiseSettledResult<unknown>;
  second: PromiseSettledResult<unknown>;
  firstPid: number;
  secondPid: number;
  observedBlocking: boolean;
};

export type FirstBody = (
  tx: Prisma.TransactionClient,
  hooks: { afterLock: () => Promise<void> }
) => Promise<unknown>;

export type SecondBody = (tx: Prisma.TransactionClient) => Promise<unknown>;

async function settleOriginal(p: Promise<unknown>, label: string): Promise<PromiseSettledResult<unknown>> {
  try {
    const value = await withTimeout(p, SETTLE_TIMEOUT, label);
    return { status: "fulfilled", value };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("超时:")) {
      return { status: "rejected", reason: new TransactionTimeoutError(label) };
    }
    return { status: "rejected", reason: e };
  }
}

// 运行两个真正重叠的事务。无论成功失败都释放 barrier，并等待原始事务 settle（不是包装器）。
// 若原始事务超过 SETTLE_TIMEOUT 仍未结束，返回 TransactionTimeoutError；外层 finally 会断开
// 这些测试自有连接，从而触发数据库回滚，再清理数据。
export async function runOverlap(
  left: PrismaClient,
  right: PrismaClient,
  observer: PrismaClient,
  firstBody: FirstBody,
  secondBody: SecondBody
): Promise<OverlapOutcome> {
  const barrier = makeBarrier();
  const secondReady = makeLatch();
  let firstPid = 0;
  let secondPid = 0;
  let observedBlocking = false;
  let firstPromise: Promise<unknown> | null = null;
  let secondPromise: Promise<unknown> | null = null;
  let setupError: unknown = null;

  try {
    firstPromise = left.$transaction(
      async (tx) => {
        await setTxTimeouts(tx);
        firstPid = await backendPid(tx);
        return firstBody(tx, { afterLock: () => barrier.afterLock() });
      },
      { timeout: DB_TX_TIMEOUT }
    );
    firstPromise.catch(() => {}); // 防止在 settle 接管前被当作未处理 rejection

    await withTimeout(barrier.locked, TX_TIMEOUT, "第一个事务持锁");

    secondPromise = right.$transaction(
      async (tx) => {
        await setTxTimeouts(tx);
        secondPid = await backendPid(tx);
        secondReady.signal();
        return secondBody(tx);
      },
      { timeout: DB_TX_TIMEOUT }
    );
    secondPromise.catch(() => {}); // 同上

    await withTimeout(secondReady.wait(), TX_TIMEOUT, "第二个事务取得 PID");

    observedBlocking = await waitForBlock(observer, secondPid, firstPid, OBSERVE_TIMEOUT);
  } catch (e) {
    setupError = e;
  } finally {
    barrier.release();
  }

  // 等待原始事务结束（回滚/提交），而不是等 withTimeout 包装器。
  const first = await settleOriginal(firstPromise ?? Promise.resolve(), "第一个事务结束");
  const second = await settleOriginal(secondPromise ?? Promise.resolve(), "第二个事务结束");

  const outcome: OverlapOutcome = { first, second, firstPid, secondPid, observedBlocking };
  if (setupError) throw setupError;
  return outcome;
}
