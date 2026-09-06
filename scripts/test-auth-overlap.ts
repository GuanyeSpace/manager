// 真实重叠执行（数据库锁竞争）测试：使用两个独立连接 + barrier 明确暂停点。
// 与 test-auth-concurrency 的顺序回归/旧状态复核区分开。
import { hash } from "bcryptjs";
import { Role, EmploymentStatus } from "../app/generated/prisma/enums";
import type { PrismaClient } from "../app/generated/prisma/client";
import {
  resolveTestClient,
  assertTestDatabase,
  newRunId,
  cleanupRun,
  validateTestEnv,
} from "./lib/test-db";
import {
  createLoginSession,
  changePasswordSession,
  AuthStateChangedError,
} from "../modules/auth/auth-service";
import { resetPasswordMutation, resignUserMutation } from "../modules/users/user-mutations";

let failures = 0;
function check(name: string, cond: boolean, extra = ""): void {
  if (cond) console.log("PASS:", name);
  else {
    failures++;
    console.log("FAIL:", name, extra);
  }
}

function latch(): { entered: Promise<void>; release: () => void; afterLock: () => Promise<void> } {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((r) => (enter = r));
  const released = new Promise<void>((r) => (release = r));
  return {
    entered,
    release,
    afterLock: () => {
      enter();
      return released;
    },
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`超时: ${label}`)), ms)),
  ]);
}

async function isSessionAuthentic(client: PrismaClient, token: string): Promise<boolean> {
  const s = await client.session.findUnique({ where: { id: token }, include: { user: true } });
  if (!s) return false;
  return s.expiresAt.getTime() > Date.now() && s.user.employmentStatus === EmploymentStatus.ACTIVE;
}

async function resetUser(client: PrismaClient, userId: string, oldHash: string): Promise<void> {
  await client.user.update({
    where: { id: userId },
    data: { passwordHash: oldHash, mustChangePassword: false, employmentStatus: EmploymentStatus.ACTIVE },
  });
  await client.session.deleteMany({ where: { userId } });
}

async function main(): Promise<void> {
  const { dbName } = validateTestEnv();
  const admin = resolveTestClient();
  await assertTestDatabase(admin, dbName);
  const left = resolveTestClient();
  const right = resolveTestClient();
  const marker = newRunId();

  try {
    const branch = await admin.branch.create({ data: { name: `${marker}-branch` } });
    const oldHash = await hash("OldPass1234", 10);
    const newHash = await hash("NewPass1234", 10);
    const boss = await admin.user.create({
      data: {
        username: `${marker}-boss`,
        name: "boss",
        passwordHash: "not-a-real-hash",
        role: Role.BOSS,
        branchId: null,
        mustChangePassword: false,
      },
    });
    const user = await admin.user.create({
      data: {
        username: `${marker}-user`,
        name: "user",
        passwordHash: oldHash,
        role: Role.CONTROLLER,
        branchId: branch.id,
        mustChangePassword: false,
      },
    });

    // 1) 重置事务持有用户行锁，旧密码登录等待；重置提交后登录被拒。
    {
      const l = latch();
      const resetP = left.$transaction((tx) =>
        resetPasswordMutation(tx, boss.id, undefined, user.id, newHash, {
          afterUserLock: () => l.afterLock(),
        })
      );
      await withTimeout(l.entered, 5000, "entered-reset");
      const loginP = right.$transaction((tx) =>
        createLoginSession(tx, { userId: user.id, verifiedHash: oldHash, ip: null })
      );
      l.release();
      const results = await Promise.allSettled([
        withTimeout(resetP, 5000, "reset"),
        withTimeout(loginP, 5000, "login"),
      ]);
      check("重置持锁时旧登录被拒", results[0].status === "fulfilled" && results[1].status === "rejected" && results[1].reason instanceof AuthStateChangedError);
    }

    // 2) 登录事务先持锁并创建会话，重置等待；随后重置撤销该会话。
    {
      await resetUser(admin, user.id, oldHash);
      const l = latch();
      const loginP = left.$transaction((tx) =>
        createLoginSession(tx, { userId: user.id, verifiedHash: oldHash, ip: null }, {
          afterUserLock: () => l.afterLock(),
        })
      );
      await withTimeout(l.entered, 5000, "entered-login");
      const resetP = right.$transaction((tx) =>
        resetPasswordMutation(tx, boss.id, undefined, user.id, newHash)
      );
      l.release();
      const results = await Promise.allSettled([
        withTimeout(loginP, 5000, "login"),
        withTimeout(resetP, 5000, "reset"),
      ]);
      const token = results[0].status === "fulfilled" ? (results[0].value as { token: string }).token : "";
      check("登录与重置重叠：两者均完成", results.every((r) => r.status === "fulfilled"));
      check("重置撤销了登录创建的会话", token !== "" && !(await isSessionAuthentic(admin, token)));
    }

    // 3) 本人改密持锁，旧密码登录等待；改密提交后登录被拒。
    {
      await resetUser(admin, user.id, oldHash);
      const curToken = `${marker}-cur`;
      await admin.session.create({ data: { id: curToken, userId: user.id, expiresAt: new Date(Date.now() + 60_000) } });
      const l = latch();
      const changeP = left.$transaction((tx) =>
        changePasswordSession(
          tx,
          { userId: user.id, sessionToken: curToken, verifiedHash: oldHash, newPasswordHash: newHash, ip: null },
          { afterUserLock: () => l.afterLock() }
        )
      );
      await withTimeout(l.entered, 5000, "entered-change");
      const loginP = right.$transaction((tx) =>
        createLoginSession(tx, { userId: user.id, verifiedHash: oldHash, ip: null })
      );
      l.release();
      const results = await Promise.allSettled([
        withTimeout(changeP, 5000, "change"),
        withTimeout(loginP, 5000, "login"),
      ]);
      check("改密持锁时旧登录被拒", results[0].status === "fulfilled" && results[1].status === "rejected" && results[1].reason instanceof AuthStateChangedError);
    }

    // 4) 登录持锁，离职等待；登录提交后离职撤销其会话。
    {
      await resetUser(admin, user.id, oldHash);
      const l = latch();
      const loginP = left.$transaction((tx) =>
        createLoginSession(tx, { userId: user.id, verifiedHash: oldHash, ip: null }, {
          afterUserLock: () => l.afterLock(),
        })
      );
      await withTimeout(l.entered, 5000, "entered-login2");
      const resignP = right.$transaction((tx) => resignUserMutation(tx, boss.id, undefined, user.id));
      l.release();
      const results = await Promise.allSettled([
        withTimeout(loginP, 5000, "login"),
        withTimeout(resignP, 5000, "resign"),
      ]);
      const token = results[0].status === "fulfilled" ? (results[0].value as { token: string }).token : "";
      check("登录与离职重叠：两者均完成", results.every((r) => r.status === "fulfilled"));
      check("离职撤销了登录创建的会话", token !== "" && !(await isSessionAuthentic(admin, token)));
    }
  } finally {
    await left.$disconnect().catch(() => {});
    await right.$disconnect().catch(() => {});
    await cleanupRun(admin, marker);
    await admin.$disconnect();
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
