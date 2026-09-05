// 在职老板不变量 + 岗位/在职状态写入的并发与交错测试。
// 必须在隔离测试库运行（见 README）。只清理本次运行创建的数据。
import { Role, EmploymentStatus } from "../app/generated/prisma/enums";
import {
  resolveTestClient,
  assertTestDatabase,
  newRunId,
  cleanupRun,
  validateTestEnv,
} from "./lib/test-db";
import {
  updateUserMutation,
  resignUserMutation,
  reactivateUserMutation,
} from "../modules/users/user-mutations";
import {
  ActiveBossConstraintError,
  ActorPermissionChangedError,
  UserActionError,
} from "../modules/users/boss-guard";

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
  const client = resolveTestClient();
  await assertTestDatabase(client, dbName);
  const marker = newRunId();

  try {
    const branch = await client.branch.create({ data: { name: `${marker}-branch` } });

    async function createUser(username: string, role: Role, opts: { status?: EmploymentStatus } = {}) {
      return client.user.create({
        data: {
          username: `${marker}-${username}`,
          name: username,
          passwordHash: "not-a-real-hash",
          role,
          branchId: role === Role.BOSS ? null : branch.id,
          mustChangePassword: false,
          employmentStatus: opts.status ?? EmploymentStatus.ACTIVE,
        },
      });
    }

    async function activeBossCount(): Promise<number> {
      return client.user.count({
        where: { role: Role.BOSS, employmentStatus: EmploymentStatus.ACTIVE },
      });
    }

    // 1) 两个老板并发互相降岗：恰好一个成功、一个被在职老板不变量拒绝。
    {
      const a = await createUser("a", Role.BOSS);
      const b = await createUser("b", Role.BOSS);
      const demote = (actorId: string, targetId: string) =>
        client.$transaction((tx) =>
          updateUserMutation(tx, actorId, targetId, { name: "x", role: Role.OPERATOR, branchId: branch.id })
        );
      const results = await Promise.allSettled([demote(a.id, b.id), demote(b.id, a.id)]);
      const rejected = results.filter((r) => r.status === "rejected");
      check(
        "并发互相降岗：一成功一拒绝",
        results.filter((r) => r.status === "fulfilled").length === 1 &&
          rejected.length === 1 &&
          rejected.every(
            (r) =>
              r.status === "rejected" &&
              (r.reason instanceof ActorPermissionChangedError || r.reason instanceof ActiveBossConstraintError)
          )
      );
      check("并发互相降岗后仍至少一个老板", (await activeBossCount()) >= 1);
      await client.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    }

    // 2) 两个老板并发互相离职：恰好一个成功、一个被拒绝。
    {
      const a = await createUser("c", Role.BOSS);
      const b = await createUser("d", Role.BOSS);
      const resign = (actorId: string, targetId: string) =>
        client.$transaction((tx) => resignUserMutation(tx, actorId, targetId));
      const results = await Promise.allSettled([resign(a.id, b.id), resign(b.id, a.id)]);
      const rejected = results.filter((r) => r.status === "rejected");
      check(
        "并发互相离职：一成功一拒绝",
        results.filter((r) => r.status === "fulfilled").length === 1 &&
          rejected.length === 1 &&
          rejected.every(
            (r) =>
              r.status === "rejected" &&
              (r.reason instanceof ActorPermissionChangedError || r.reason instanceof ActiveBossConstraintError)
          )
      );
      check("并发互相离职后仍至少一个老板", (await activeBossCount()) >= 1);
      await client.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    }

    // 3) 最后一个在职老板不能被移除。
    {
      const only = await createUser("only", Role.BOSS);
      let selfDemoteRejected = false;
      try {
        await client.$transaction((tx) =>
          updateUserMutation(tx, only.id, only.id, { name: "x", role: Role.OPERATOR, branchId: branch.id })
        );
      } catch (e) {
        selfDemoteRejected = e instanceof UserActionError;
      }
      check("最后一个老板不能把自己降岗", selfDemoteRejected);

      let selfResignRejected = false;
      try {
        await client.$transaction((tx) => resignUserMutation(tx, only.id, only.id));
      } catch (e) {
        selfResignRejected = e instanceof UserActionError;
      }
      check("最后一个老板不能把自己设为离职", selfResignRejected);
      await client.user.deleteMany({ where: { id: only.id } });
    }

    // 4) 升岗与旧降岗请求交错：目标在事务内被重读，按最新状态判断。
    {
      const a = await createUser("a2", Role.BOSS);
      const c = await createUser("op2", Role.OPERATOR);
      await client.user.update({ where: { id: c.id }, data: { role: Role.BOSS, branchId: null } }); // 升岗
      // 旧请求仍把 c 当运营降岗；重读后 c 已是老板，降岗被不变量检查（此时 2 个老板，允许）。
      const res = await client.$transaction((tx) =>
        updateUserMutation(tx, a.id, c.id, { name: "x", role: Role.OPERATOR, branchId: branch.id })
      );
      check("升岗后旧降岗请求按最新状态执行", res.updated.role === Role.OPERATOR);
      check("交错后仍至少一个老板", (await activeBossCount()) >= 1);
      await client.user.deleteMany({ where: { id: { in: [a.id, c.id] } } });
    }

    // 5) 复职与旧离职请求交错：旧离职重读目标，发现已离职则拒绝而不是破坏不变量。
    {
      const a = await createUser("a3", Role.BOSS);
      const c = await createUser("op3", Role.OPERATOR);
      await client.$transaction((tx) => resignUserMutation(tx, a.id, c.id));
      let staleResignRejected = false;
      try {
        await client.$transaction((tx) => resignUserMutation(tx, a.id, c.id));
      } catch (e) {
        staleResignRejected = e instanceof UserActionError; // 已离职
      }
      check("旧离职请求重读后识别已离职", staleResignRejected);

      await client.$transaction((tx) => reactivateUserMutation(tx, a.id, c.id));
      check("复职成功", (await client.user.findUnique({ where: { id: c.id } }))?.employmentStatus === EmploymentStatus.ACTIVE);
      await client.user.deleteMany({ where: { id: { in: [a.id, c.id] } } });
    }

    // 6) 操作者等待期间被降岗：过期的老板身份被拒绝。
    {
      const a = await createUser("actor", Role.BOSS);
      const b = await createUser("actor2", Role.BOSS);
      const target = await createUser("tgt", Role.OPERATOR);
      // b 把 a 降为运营
      await client.$transaction((tx) =>
        updateUserMutation(tx, b.id, a.id, { name: "x", role: Role.OPERATOR, branchId: branch.id })
      );
      let rejected = false;
      try {
        await client.$transaction((tx) =>
          updateUserMutation(tx, a.id, target.id, { name: "x", role: Role.OPERATOR, branchId: branch.id })
        );
      } catch (e) {
        rejected = e instanceof ActorPermissionChangedError;
      }
      check("被降岗的操作者不能再修改", rejected);
      await client.user.deleteMany({ where: { id: { in: [a.id, b.id, target.id] } } });
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
