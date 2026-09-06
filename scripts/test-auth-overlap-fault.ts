// 重叠测试 harness 与清理生命周期故障路径验证。
// 覆盖：无锁竞争、事务报错、第一个事务未达 barrier 报错、观察失败、清理失败、
// 以及主流程抛异常后子进程非零退出且数据被清理、不挂起。
import { spawn } from "node:child_process";
import path from "node:path";
import { hash } from "bcryptjs";
import { Role } from "../app/generated/prisma/enums";
import type { PrismaClient } from "../app/generated/prisma/client";
import {
  resolveTestClient,
  assertTestDatabase,
  validateTestEnv,
  runTestLifecycle,
  disconnectAllAndCleanup,
} from "./lib/test-db";
import { runOverlap } from "./lib/overlap-harness";
import { createLoginSession } from "../modules/auth/auth-service";

let failures = 0;
function check(name: string, cond: boolean, extra = ""): void {
  if (cond) console.log("PASS:", name);
  else {
    failures++;
    console.log("FAIL:", name, extra);
  }
}

async function countTestRows(client: PrismaClient): Promise<{ users: number; branches: number }> {
  const users = await client.user.count({ where: { username: { startsWith: "test-" } } });
  const branches = await client.branch.count({ where: { name: { startsWith: "test-" } } });
  return { users, branches };
}

function runChild(mode: string): Promise<{ code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
    const child = spawn(tsxBin, ["scripts/lib/fault-child.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FAULT_MODE: mode,
        TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
        ALLOW_TEST_DESTRUCTION: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, timedOut: true });
    }, 30000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut: false });
    });
  });
}

async function main(): Promise<void> {
  const { dbName } = validateTestEnv();

  // Part A：harness 在进程内的故障处理。
  await runTestLifecycle(3, async ({ admin, extras, marker }) => {
    const [left, right, observer] = extras;
    const branch = await admin.branch.create({ data: { name: `${marker}-branch` } });
    const pw = await hash("OldPass1234", 10);
    const u1 = await admin.user.create({
      data: { username: `${marker}-u1`, name: "u1", passwordHash: pw, role: Role.CONTROLLER, branchId: branch.id, mustChangePassword: false },
    });
    const u2 = await admin.user.create({
      data: { username: `${marker}-u2`, name: "u2", passwordHash: pw, role: Role.CONTROLLER, branchId: branch.id, mustChangePassword: false },
    });

    // 1) 无锁竞争。
    {
      const o = await runOverlap(
        left,
        right,
        observer,
        (tx, { afterLock }) => createLoginSession(tx, { userId: u1.id, verifiedHash: pw, ip: null }, { afterUserLock: afterLock }),
        (tx) => createLoginSession(tx, { userId: u2.id, verifiedHash: pw, ip: null })
      );
      check("无锁竞争时报告未阻塞", o.observedBlocking === false);
      check("无锁竞争时两个事务均 settle", o.first.status === "fulfilled" && o.second.status === "fulfilled");
    }

    // 2) 第二个事务主动报错。
    {
      const o = await runOverlap(
        left,
        right,
        observer,
        (tx, { afterLock }) => createLoginSession(tx, { userId: u1.id, verifiedHash: pw, ip: null }, { afterUserLock: afterLock }),
        async () => {
          throw new Error("boom");
        }
      );
      check("第二个事务报错时被捕获", o.second.status === "rejected");
      check("第二个事务报错时第一个事务仍 settle", o.first.status === "fulfilled");
    }

    // 3) 第一个事务在到达 barrier 前报错：runOverlap 应抛出，且不挂起。
    {
      let threw = false;
      try {
        await runOverlap(
          left,
          right,
          observer,
          async () => {
            throw new Error("first body error");
          },
          (tx) => createLoginSession(tx, { userId: u2.id, verifiedHash: pw, ip: null })
        );
      } catch {
        threw = true;
      }
      check("第一个事务未达 barrier 报错时 runOverlap 抛出", threw);
    }

    // 4) 观察连接报错/失败：不挂起，报告未观察到阻塞并 settle。
    {
      const brokenObserver = {
        $queryRaw: async () => {
          throw new Error("observer error");
        },
      } as unknown as PrismaClient;
      const o = await runOverlap(
        left,
        right,
        brokenObserver,
        (tx, { afterLock }) => createLoginSession(tx, { userId: u1.id, verifiedHash: pw, ip: null }, { afterUserLock: afterLock }),
        (tx) => createLoginSession(tx, { userId: u1.id, verifiedHash: pw, ip: null })
      );
      check("观察失败时未观察到阻塞", o.observedBlocking === false);
      check("观察失败时两个事务均 settle", o.first.status === "fulfilled" && o.second.status === "fulfilled");
    }
  });

  // Part B：清理步骤报错时，其他连接仍断开。
  {
    let extraDisconnected = false;
    let adminDisconnected = false;
    const adminStub = {
      user: { findMany: async () => { throw new Error("cleanup error"); } },
      auditLog: { deleteMany: async () => {} },
      branch: { deleteMany: async () => {} },
      $disconnect: async () => { adminDisconnected = true; },
    } as unknown as PrismaClient;
    const extraStub = {
      $disconnect: async () => { extraDisconnected = true; },
    } as unknown as PrismaClient;

    let cleanupThrew = false;
    try {
      await disconnectAllAndCleanup(adminStub, [extraStub], "test-marker");
    } catch {
      cleanupThrew = true;
    }
    check("清理失败时 disconnectAllAndCleanup 不抛出", cleanupThrew === false);
    check("清理失败时其他连接仍已断开", extraDisconnected);
    check("清理失败时 admin 仍断开", adminDisconnected);
  }

  // Part C：主流程抛异常的子进程非零退出 + 数据清理 + 不挂起。
  {
    const admin = resolveTestClient();
    await assertTestDatabase(admin, dbName);
    const before = await countTestRows(admin);
    const result = await runChild("main_throw");
    const after = await countTestRows(admin);
    check("子进程主流程抛异常时非零退出", result.code !== 0, `code=${result.code}`);
    check("子进程主流程抛异常时不挂起", result.timedOut === false);
    check(
      "子进程主流程抛异常后本轮数据被清理",
      after.users === before.users && after.branches === before.branches,
      `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
    );
    await admin.$disconnect().catch(() => {});
  }

  if (failures > 0) {
    console.log(`\n${failures} FAILURES`);
    process.exit(1);
  }
  console.log("\nALL PASS");
}

main().catch(async (e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
