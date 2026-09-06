// 真实重叠执行（数据库锁竞争）测试：
// 每个场景都用 pg_backend_pid() 确认两个事务使用不同连接，用 pg_blocking_pids()
// 确认第二个事务确实被第一个事务阻塞，之后才释放第一个事务。
import { hash } from "bcryptjs";
import { Role, EmploymentStatus } from "../app/generated/prisma/enums";
import type { PrismaClient } from "../app/generated/prisma/client";
import { runTestLifecycle } from "./lib/test-db";
import { runOverlap, type OverlapOutcome } from "./lib/overlap-harness";
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

function assertObservedBlocking(label: string, o: OverlapOutcome): void {
  check(`${label}：确认使用不同数据库连接`, o.firstPid !== 0 && o.secondPid !== 0 && o.firstPid !== o.secondPid);
  check(`${label}：已观察到预期锁阻塞`, o.observedBlocking, `firstPid=${o.firstPid} secondPid=${o.secondPid}`);
}

async function main(): Promise<void> {
  await runTestLifecycle(3, async ({ admin, extras, marker }) => {
    const [left, right, observer] = extras;

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

    // 1) 重置持锁，旧密码登录等待；重置提交后登录被拒。
    {
      const outcome = await runOverlap(
        left,
        right,
        observer,
        (tx, { afterLock }) =>
          resetPasswordMutation(tx, boss.id, undefined, user.id, newHash, { afterUserLock: afterLock }),
        (tx) => createLoginSession(tx, { userId: user.id, verifiedHash: oldHash, ip: null })
      );
      assertObservedBlocking("重置阻塞旧登录", outcome);
      check("重置阻塞旧登录：重置成功", outcome.first.status === "fulfilled");
      check(
        "重置阻塞旧登录：登录被拒",
        outcome.second.status === "rejected" && outcome.second.reason instanceof AuthStateChangedError
      );
      check("重置阻塞旧登录：登录被拒后未产生会话", (await admin.session.count({ where: { userId: user.id } })) === 0);
    }

    // 2) 登录持锁，重置等待；登录提交后重置撤销其会话。
    {
      await resetUser(admin, user.id, oldHash);
      const outcome = await runOverlap(
        left,
        right,
        observer,
        (tx, { afterLock }) =>
          createLoginSession(tx, { userId: user.id, verifiedHash: oldHash, ip: null }, { afterUserLock: afterLock }),
        (tx) => resetPasswordMutation(tx, boss.id, undefined, user.id, newHash)
      );
      assertObservedBlocking("登录阻塞重置", outcome);
      check("登录阻塞重置：登录成功", outcome.first.status === "fulfilled");
      check("登录阻塞重置：重置成功", outcome.second.status === "fulfilled");
      const token = outcome.first.status === "fulfilled" ? (outcome.first.value as { token: string }).token : "";
      check("登录阻塞重置：最终登录会话被撤销", token !== "" && !(await isSessionAuthentic(admin, token)));
    }

    // 3) 本人改密持锁，旧密码登录等待；改密提交后登录被拒。
    {
      await resetUser(admin, user.id, oldHash);
      const curToken = `${marker}-cur`;
      await admin.session.create({ data: { id: curToken, userId: user.id, expiresAt: new Date(Date.now() + 60_000) } });
      const outcome = await runOverlap(
        left,
        right,
        observer,
        (tx, { afterLock }) =>
          changePasswordSession(
            tx,
            { userId: user.id, sessionToken: curToken, verifiedHash: oldHash, newPasswordHash: newHash, ip: null },
            { afterUserLock: afterLock }
          ),
        (tx) => createLoginSession(tx, { userId: user.id, verifiedHash: oldHash, ip: null })
      );
      assertObservedBlocking("改密阻塞旧登录", outcome);
      check("改密阻塞旧登录：改密成功", outcome.first.status === "fulfilled");
      check(
        "改密阻塞旧登录：登录被拒",
        outcome.second.status === "rejected" && outcome.second.reason instanceof AuthStateChangedError
      );
      const newToken = outcome.first.status === "fulfilled" ? (outcome.first.value as { token: string }).token : "";
      check("改密阻塞旧登录：原会话失效", !(await isSessionAuthentic(admin, curToken)));
      check("改密阻塞旧登录：改密返回的新会话可认证", newToken !== "" && (await isSessionAuthentic(admin, newToken)));
      check("改密阻塞旧登录：被拒旧登录未额外创建会话", (await admin.session.count({ where: { userId: user.id } })) === 1);
    }

    // 4) 登录持锁，离职等待；登录提交后离职撤销其会话。
    {
      await resetUser(admin, user.id, oldHash);
      const outcome = await runOverlap(
        left,
        right,
        observer,
        (tx, { afterLock }) =>
          createLoginSession(tx, { userId: user.id, verifiedHash: oldHash, ip: null }, { afterUserLock: afterLock }),
        (tx) => resignUserMutation(tx, boss.id, undefined, user.id)
      );
      assertObservedBlocking("登录阻塞离职", outcome);
      check("登录阻塞离职：登录成功", outcome.first.status === "fulfilled");
      check("登录阻塞离职：离职成功", outcome.second.status === "fulfilled");
      const token = outcome.first.status === "fulfilled" ? (outcome.first.value as { token: string }).token : "";
      check("登录阻塞离职：最终登录会话被撤销", token !== "" && !(await isSessionAuthentic(admin, token)));
    }
  });

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
