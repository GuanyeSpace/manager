// 重叠测试 harness 的故障路径验证：
// 1) 无锁竞争时能报告「未观察到阻塞」而不是误判为竞争；
// 2) 第二个事务主动报错时能 settle 并返回，不挂起、不遗留持锁。
// 本脚本预期全部通过（即 harness 正确报告故障并清理）。
import { hash } from "bcryptjs";
import { Role } from "../app/generated/prisma/enums";
import {
  resolveTestClient,
  assertTestDatabase,
  newRunId,
  cleanupRun,
  validateTestEnv,
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

async function main(): Promise<void> {
  const { dbName } = validateTestEnv();
  const admin = resolveTestClient();
  await assertTestDatabase(admin, dbName);
  const left = resolveTestClient();
  const right = resolveTestClient();
  const observer = resolveTestClient();
  const marker = newRunId();

  try {
    const branch = await admin.branch.create({ data: { name: `${marker}-branch` } });
    const pw = await hash("OldPass1234", 10);
    const u1 = await admin.user.create({
      data: { username: `${marker}-u1`, name: "u1", passwordHash: pw, role: Role.CONTROLLER, branchId: branch.id, mustChangePassword: false },
    });
    const u2 = await admin.user.create({
      data: { username: `${marker}-u2`, name: "u2", passwordHash: pw, role: Role.CONTROLLER, branchId: branch.id, mustChangePassword: false },
    });

    // 1) 无锁竞争：第一个事务持 u1 行锁，第二个事务改 u2（不同行），不应观察到阻塞。
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

    // 2) 第二个事务主动报错：能 settle 并返回，不挂起。
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
  } finally {
    for (const c of [left, right, observer]) {
      await c.$disconnect().catch(() => {});
    }
  }

  try {
    await cleanupRun(admin, marker);
  } finally {
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
