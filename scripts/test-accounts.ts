import assert from "node:assert/strict";
import { Role } from "../app/generated/prisma/enums";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
import { saveAccount, setBranchManager } from "../modules/accounts/service";
import { readAccountList, readAccountDetail, readAccountHistory, readAccountOptions } from "../modules/accounts/data";
import { accountSchema, type AccountInput } from "../modules/accounts/schema";
import { resignUserMutation, updateUserMutation } from "../modules/users/user-mutations";

async function main() {
  const { dbName } = validateTestEnv();
  const db = resolveTestClient();
  const marker = newRunId();
  let verified = false;
  try {
    await assertTestDatabase(db, dbName);
    verified = true;
    const a = await db.branch.create({ data: { name: `${marker}-a` } });
    const b = await db.branch.create({ data: { name: `${marker}-b` } });
    async function user(name: string, role: Role, branchId: string | null) {
      const u = await db.user.create({ data: { username: `${marker}-${name}`, name, role, branchId, passwordHash: "not-a-real-hash", mustChangePassword: false } });
      const token = `${marker}-${name}-session`;
      await db.session.create({ data: { id: token, userId: u.id, expiresAt: new Date(Date.now() + 3600000) } });
      return { ...u, token };
    }
    const boss = await user("boss", Role.BOSS, null);
    const manager = await user("manager", Role.OPERATOR, a.id);
    const control = await user("control", Role.CONTROLLER, a.id);
    const next = await user("next", Role.CONTROLLER, a.id);
    const outsider = await user("outsider", Role.CONTROLLER, b.id);
    const anchor = await user("anchor", Role.ANCHOR, a.id);
    const save = (token: string, input: AccountInput) => db.$transaction((tx) => saveAccount(tx, token, input, "test"));
    const detail = (token: string, id: string) => db.$transaction((tx) => readAccountDetail(tx, token, id), { isolationLevel: "RepeatableRead" });
    const list = (token: string) => db.$transaction((tx) => readAccountList(tx, token), { isolationLevel: "RepeatableRead" });
    const appoint = (token: string, branchId: string, managerId: string, previousManagerId = "") =>
      db.$transaction((tx) => setBranchManager(tx, token, { branchId, managerId, previousManagerId }, "test"));
    await appoint(boss.token, a.id, manager.id);
    await appoint(boss.token, b.id, boss.id);
    assert.equal((await db.branch.findUniqueOrThrow({ where: { id: b.id } })).managerId, boss.id);
    await assert.rejects(appoint(manager.token, a.id, control.id, manager.id), /仅老板/);
    await assert.rejects(appoint(boss.token, a.id, outsider.id, manager.id), /本公司/);
    await assert.rejects(appoint(boss.token, a.id, control.id), /已变化/);
    const input: AccountInput = { id: "", version: 0, douyinId: `${marker}-account`, name: "原账号名称", homepageUrl: "https://www.douyin.com/user/example", realName: "仅当前实名", phone: "13800000000", purpose: "直播", notes: "当前备注", branchId: a.id, operatorId: "", controllerId: control.id, anchorId: "", active: "true" };
    assert.equal(accountSchema.safeParse({ ...input, controllerId: "" }).success, false);
    assert.equal(accountSchema.safeParse({ ...input, homepageUrl: "javascript:alert(1)" }).success, false);
    assert.equal(accountSchema.safeParse({ ...input, homepageUrl: "https://douyin.com.evil.example" }).success, false);
    await assert.rejects(save(control.token, input), /无权/);
    await assert.rejects(save(manager.token, { ...input, branchId: b.id, controllerId: outsider.id }), /无权/);
    await assert.rejects(save(manager.token, { ...input, controllerId: anchor.id }), /岗位/);
    await assert.rejects(save(manager.token, { ...input, controllerId: outsider.id }), /岗位/);
    const id = await save(manager.token, input);
    assert.equal((await list(control.token)).accounts.length, 1);
    assert.equal((await list(outsider.token)).accounts.length, 0);
    assert.equal((await detail(outsider.token, id)).account, null);
    assert.equal((await detail(outsider.token, id)).history.length, 0);
    assert.equal((await list(manager.token)).canCreate, true);
    assert.equal((await list(control.token)).canCreate, false);
    const opts = await db.$transaction((tx) => readAccountOptions(tx, manager.token));
    assert.deepEqual(opts.branches.map((v) => v.id), [a.id]);
    assert.equal(opts.people.some((p) => p.id === outsider.id), false);
    await assert.rejects(db.$transaction((tx) => resignUserMutation(tx, boss.id, boss.token, control.id)), /先完成交接/);
    await assert.rejects(db.$transaction((tx) => updateUserMutation(tx, boss.id, boss.token, control.id, { name: control.name, role: Role.CONTROLLER, branchId: b.id })), /先完成交接/);
    await assert.rejects(db.$transaction((tx) => resignUserMutation(tx, boss.id, boss.token, manager.id)), /先完成交接/);
    const update = { ...input, id, version: 1, controllerId: next.id, name: "交接后名称", phone: "13900000000" };
    await save(manager.token, update);
    const oldView = await detail(control.token, id);
    assert.equal(oldView.account, null);
    assert.equal(oldView.canEdit, false);
    assert.equal(oldView.options, null);
    assert.equal(oldView.history.length, 1);
    assert.equal(oldView.history[0].name, "原账号名称");
    assert.equal(JSON.stringify(oldView).includes("13900000000"), false);
    assert.equal(JSON.stringify(oldView).includes("仅当前实名"), false);
    assert.equal(JSON.stringify(oldView).includes("交接后名称"), false);
    assert.equal((await list(control.token)).accounts.length, 0);
    assert.equal((await detail(next.token, id)).history.length, 0);
    await assert.rejects(save(manager.token, update), /已被其他人修改/);
    await assert.rejects(save(manager.token, { ...update, version: 2, branchId: b.id, controllerId: outsider.id }), /跨公司/);
    await save(boss.token, { ...update, version: 2, branchId: b.id, controllerId: boss.id });
    assert.equal((await detail(manager.token, id)).account, null);
    assert.equal((await detail(manager.token, id)).history.length, 2);
    assert.equal((await detail(next.token, id)).account, null);
    assert.equal((await detail(next.token, id)).history.length, 1);
    const transferred = { ...update, version: 3, branchId: b.id, controllerId: boss.id };
    const race = await Promise.allSettled([save(boss.token, { ...transferred, name: "并发甲" }), save(boss.token, { ...transferred, name: "并发乙" })]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(race.filter((r) => r.status === "rejected").length, 1);
    assert.equal(await db.accountRecord.count({ where: { accountId: id, endedAt: null } }), 1);
    assert.equal((await db.douyinAccount.findUniqueOrThrow({ where: { id } })).version, 4);
    const auditCount = await db.auditLog.count({ where: { targetId: id } });
    await assert.rejects(db.$transaction(async (tx) => { await saveAccount(tx, boss.token, { ...transferred, version: 4 }, "test"); throw new Error("simulate rollback"); }), /simulate rollback/);
    assert.equal((await db.douyinAccount.findUniqueOrThrow({ where: { id } })).version, 4);
    assert.equal(await db.auditLog.count({ where: { targetId: id } }), auditCount);
    assert.equal(await db.accountRecord.count({ where: { accountId: id } }), 4);
    await db.branch.update({ where: { id: b.id }, data: { status: "INACTIVE" } });
    await assert.rejects(save(boss.token, { ...transferred, version: 4 }), /停用/);
    await db.branch.update({ where: { id: b.id }, data: { status: "ACTIVE" } });
    await appoint(boss.token, a.id, "", manager.id);
    await assert.rejects(save(manager.token, { ...input, douyinId: `${marker}-revoked` }), /无权/);
    assert.equal((await list(manager.token)).canCreate, false);
    await db.user.update({ where: { id: control.id }, data: { employmentStatus: "RESIGNED" } });
    await assert.rejects(detail(control.token, id), /登录或权限/);
    await db.user.update({ where: { id: next.id }, data: { mustChangePassword: true } });
    await assert.rejects(db.$transaction((tx) => readAccountHistory(tx, next.token)), /登录或权限/);
    await db.session.delete({ where: { id: boss.token } });
    await assert.rejects(save(boss.token, { ...transferred, version: 4 }), /登录或权限/);
    console.log("PASS: 岗位校验、老板兼任、分公司授权、直接访问隔离、历史脱敏、交接前置、并发冲突、事务回滚、权限撤销");
  } finally {
    try {
      if (verified) {
        const accounts = await db.douyinAccount.findMany({ where: { douyinId: { startsWith: marker } }, select: { id: true } });
        const ids = accounts.map((v) => v.id);
        await db.accountRecord.deleteMany({ where: { accountId: { in: ids } } });
        await db.auditLog.deleteMany({ where: { targetId: { in: ids } } });
        await db.douyinAccount.deleteMany({ where: { id: { in: ids } } });
        await db.branch.updateMany({ where: { name: { startsWith: marker } }, data: { managerId: null } });
        await cleanupRun(db, marker);
      }
    } finally { await db.$disconnect(); }
  }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch((e) => { console.error(e); process.exitCode = 1; });
