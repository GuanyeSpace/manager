import type { PrismaClient, Prisma } from "../../app/generated/prisma/client";

export const TX_TIMEOUT = 20000;
export const DB_TX_TIMEOUT = 30000;
export const OBSERVE_TIMEOUT = 5000;

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

// 第一个事务持锁的 barrier：afterLock 先通知「已持锁」，再等待 release。
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

// 当前交互式事务所在数据库连接的 backend pid。
export async function backendPid(tx: Prisma.TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
  return Number(rows[0].pid);
}

// 观察连接上判断 blockedPid 是否正被 blockerPid 阻塞。
export async function isBlockedBy(
  observer: PrismaClient,
  blockedPid: number,
  blockerPid: number
): Promise<boolean> {
  const rows = await observer.$queryRaw<Array<{ blocker: number }>>`
    SELECT unnest(pg_blocking_pids(${blockedPid})) AS blocker
  `;
  return rows.some((r) => Number(r.blocker) === blockerPid);
}

// 有界轮询，直到观察到 blockedPid 被 blockerPid 阻塞；超时返回 false（由调用方判失败）。
export async function waitForBlock(
  observer: PrismaClient,
  blockedPid: number,
  blockerPid: number,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isBlockedBy(observer, blockedPid, blockerPid)) return true;
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

// 运行两个真正重叠的事务：
// 1) 第一个事务先取自己的 backend pid，再执行业务（业务内部在持锁后调用 afterLock）。
// 2) 观察到第一个持锁后，启动第二个事务；第二个事务先取 pid，再执行业务（会阻塞）。
// 3) 用独立观察连接确认第二个 pid 正被第一个 pid 阻塞，之后才释放第一个事务。
// 无论成功失败，都保证 barrier 释放、两个事务 settle，不遗留持锁或挂起。
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
        firstPid = await backendPid(tx);
        return firstBody(tx, { afterLock: () => barrier.afterLock() });
      },
      { timeout: DB_TX_TIMEOUT }
    );
    firstPromise.catch(() => {}); // 防止在 allSettled 接管前被当作未处理 rejection

    await withTimeout(barrier.locked, TX_TIMEOUT, "第一个事务持锁");

    secondPromise = right.$transaction(
      async (tx) => {
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

  const settled = await Promise.allSettled([
    withTimeout(firstPromise ?? Promise.resolve(), TX_TIMEOUT, "第一个事务结束"),
    withTimeout(secondPromise ?? Promise.resolve(), TX_TIMEOUT, "第二个事务结束"),
  ]);

  const outcome: OverlapOutcome = {
    first: settled[0],
    second: settled[1],
    firstPid,
    secondPid,
    observedBlocking,
  };

  if (setupError) throw setupError;
  return outcome;
}
