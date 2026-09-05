// 登录 / 改密 / 重置 / 离职之间的并发一致性测试。
// 必须在隔离测试库运行。只清理本次运行创建的数据。
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
  SessionRevokedError,
} from "../modules/auth/auth-service";
import { resignUserMutation } from "../modules/users/user-mutations";

let failures = 0;
function check(name: string, cond: boolean, extra = ""): void {
  if (cond) console.log("PASS:", name);
  else {
    failures++;
    console.log("FAIL:", name, extra);
  }
}

async function isSessionAuthentic(client: PrismaClient, token: string): Promise<boolean> {
  const s = await client.session.findUnique({ where: { id: token }, include: { user: true } });
  if (!s) return false;
  return s.expiresAt.getTime() > Date.now() && s.user.employmentStatus === EmploymentStatus.ACTIVE;
}

async function resetPassword(client: PrismaClient, userId: string, newPasswordHash: string): Promise<void> {
  await client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    await tx.user.update({ where: { id: userId }, data: { passwordHash: newPasswordHash, mustChangePassword: true } });
    await tx.session.deleteMany({ where: { userId } });
  });
}

async function main(): Promise<void> {
  const { dbName } = validateTestEnv();
  const client = resolveTestClient();
  await assertTestDatabase(client, dbName);
  const marker = newRunId();

  try {
    const branch = await client.branch.create({ data: { name: `${marker}-branch` } });
    const oldHash = await hash("OldPass1234", 10);
    const newHash = await hash("NewPass1234", 10);
    const boss = await client.user.create({
      data: {
        username: `${marker}-boss`,
        name: "boss",
        passwordHash: "not-a-real-hash",
        role: Role.BOSS,
        branchId: null,
        mustChangePassword: false,
      },
    });
    const user = await client.user.create({
      data: {
        username: `${marker}-user`,
        name: "user",
        passwordHash: oldHash,
        role: Role.CONTROLLER,
        branchId: branch.id,
        mustChangePassword: false,
      },
    });

    // 1) 旧密码验证通过 → 重置提交 → 登录继续：不得创建会话。
    {
      const verifiedHash = user.passwordHash; // 模拟事务外 bcrypt 验证通过
      await resetPassword(client, user.id, newHash);
      let rejected = false;
      try {
        await client.$transaction((tx) => createLoginSession(tx, { userId: user.id, verifiedHash, ip: null }));
      } catch (e) {
        rejected = e instanceof AuthStateChangedError;
      }
      check("旧密码验证后重置，登录继续被拒", rejected);
      check("被拒后未创建会话", (await client.session.count({ where: { userId: user.id } })) === 0);
    }

    // 2) 登录提交 → 重置提交：重置必须撤销登录创建的会话。
    {
      const fresh = await client.user.update({ where: { id: user.id }, data: { passwordHash: oldHash, mustChangePassword: false } });
      const login = await client.$transaction((tx) =>
        createLoginSession(tx, { userId: user.id, verifiedHash: fresh.passwordHash, ip: null })
      );
      check("登录创建会话后可认证", await isSessionAuthentic(client, login.token));
      await resetPassword(client, user.id, newHash);
      check("重置后登录创建的会话被撤销", !(await isSessionAuthentic(client, login.token)));
    }

    // 3) 登录与本人改密并发：改密后基于旧哈希的登录被拒；旧会话被撤销。
    {
      const fresh = await client.user.update({ where: { id: user.id }, data: { passwordHash: oldHash, mustChangePassword: false } });
      const oldLogin = await client.$transaction((tx) =>
        createLoginSession(tx, { userId: user.id, verifiedHash: fresh.passwordHash, ip: null })
      );
      const changed = await client.$transaction((tx) =>
        changePasswordSession(tx, {
          userId: user.id,
          sessionToken: oldLogin.token,
          verifiedHash: oldHash,
          newPasswordHash: newHash,
          ip: null,
        })
      );
      check("改密后旧会话失效", !(await isSessionAuthentic(client, oldLogin.token)));
      check("改密后新会话可认证", await isSessionAuthentic(client, changed.token));

      let rejected = false;
      try {
        await client.$transaction((tx) =>
          createLoginSession(tx, { userId: user.id, verifiedHash: oldHash, ip: null })
        );
      } catch (e) {
        rejected = e instanceof AuthStateChangedError;
      }
      check("改密后基于旧哈希的登录被拒", rejected);
    }

    // 4) 登录与离职并发：离职撤销登录会话。
    {
      const fresh = await client.user.update({ where: { id: user.id }, data: { passwordHash: oldHash, mustChangePassword: false, employmentStatus: EmploymentStatus.ACTIVE } });
      const login = await client.$transaction((tx) =>
        createLoginSession(tx, { userId: user.id, verifiedHash: fresh.passwordHash, ip: null })
      );
      await client.$transaction((tx) => resignUserMutation(tx, boss.id, user.id));
      check("离职后登录会话失效", !(await isSessionAuthentic(client, login.token)));
    }

    // 5) 改密时当前会话已被并发撤销：必须拒绝，而不是签发新会话。
    {
      const fresh = await client.user.update({ where: { id: user.id }, data: { passwordHash: oldHash, mustChangePassword: false, employmentStatus: EmploymentStatus.ACTIVE } });
      const login = await client.$transaction((tx) =>
        createLoginSession(tx, { userId: user.id, verifiedHash: fresh.passwordHash, ip: null })
      );
      await client.session.delete({ where: { id: login.token } }); // 模拟并发重置撤销会话
      let rejected = false;
      try {
        await client.$transaction((tx) =>
          changePasswordSession(tx, {
            userId: user.id,
            sessionToken: login.token,
            verifiedHash: oldHash,
            newPasswordHash: newHash,
            ip: null,
          })
        );
      } catch (e) {
        rejected = e instanceof SessionRevokedError;
      }
      check("改密时当前会话已撤销则拒绝", rejected);
    }
  } finally {
    await cleanupRun(client, marker);
    await client.$disconnect();
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
