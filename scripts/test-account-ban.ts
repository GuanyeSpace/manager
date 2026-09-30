import assert from "node:assert/strict";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
import { saveAccount } from "../modules/accounts/service";
import { accountSchema, type AccountInput } from "../modules/accounts/schema";
import { readAccountList } from "../modules/accounts/data";
import { runWorkCommand } from "../modules/workbench/service";
import { defaultWorkflow } from "../modules/workbench/schema";
import { shanghaiInput } from "../modules/live-reports/schema";
import { accountStatusLabel } from "../lib/account-status";
import { saveResource } from "../modules/resources/service";
import { resourceSchema } from "../modules/resources/schema";

async function main() {
  const { dbName } = validateTestEnv(), db = resolveTestClient(), marker = newRunId();
  let verified = false;
  try {
    await assertTestDatabase(db, dbName); verified = true;
    const branch = await db.branch.create({ data: { name: marker } });
    const boss = await db.user.create({ data: { username: marker, name: "封禁测试", role: "BOSS", mustChangePassword: false, passwordHash: "not-real" } });
    const controller = await db.user.create({ data: { username: marker + "controller", name: "中控", role: "CONTROLLER", branchId: branch.id, mustChangePassword: false, passwordHash: "not-real" } });
    for (const user of [boss, controller]) await db.session.create({ data: { id: user.id, userId: user.id, expiresAt: new Date(Date.now() + 3600000) } });
    const input: AccountInput = { id: "", version: 0, douyinId: marker, name: "封禁账号", homepageUrl: "", realName: "", phone: "", purpose: "", notes: "", branchId: branch.id, controllerId: controller.id, operatorId: "", anchorId: boss.id, active: "banned", unbanDate: "2026-10-15" };
    const save = (value: AccountInput, token = boss.id) => db.$transaction(tx => saveAccount(tx, token, value, "test"));
    assert(!accountSchema.safeParse({ ...input, unbanDate: "2026-02-30" }).success);
    assert(!accountSchema.safeParse({ ...input, unbanDate: "2026-13-01" }).success);
    assert(accountSchema.safeParse({ ...input, unbanDate: "2028-02-29" }).success);
    const id = await save(input);
    const read = () => db.douyinAccount.findUniqueOrThrow({ where: { id } });
    assert.equal((await read()).active, false);
    assert.equal((await read()).banned, true);
    assert.match(accountStatusLabel(await read()), /2026-10-15/);
    assert.equal((await db.$transaction(tx => readAccountList(tx, controller.id))).accounts[0].unbanDate, "2026-10-15");
    await assert.rejects(save({ ...input, id, version: 1, active: "true" }, controller.id), /权限/);
    const create = () => db.$transaction(tx => runWorkCommand(tx, controller.id, { id, version: 0, command: "create" }, "test"));
    await assert.rejects(create(), /封禁/);
    await save({ ...input, id, version: 1, unbanDate: "2000-01-01" });
    await assert.rejects(create(), /封禁/); // 已过预计日期也不自动解封
    const numberId = await db.$transaction(tx => saveResource(tx, boss.id, "numbers", resourceSchema.parse({ version: 0, branchId: branch.id, number: "13912345678", accountId: id }), "test"));
    assert.equal((await read()).banned, true);
    assert.equal((await read()).unbanDate, "2000-01-01");
    assert.equal((await read()).phoneNumberId, numberId);
    let current = await read();
    await save({ ...input, id, version: current.version, unbanDate: "" });
    assert.match(accountStatusLabel(await read()), /待定/);
    current = await read();
    await save({ ...input, id, version: current.version, active: "true" });
    assert.equal((await read()).banned, false);
    assert.equal((await read()).unbanDate, null);
    const source = await db.accountRecord.findFirstOrThrow({ where: { accountId: id, endedAt: null } });
    const session = await db.workSession.create({ data: { accountId: id, sourceRecordId: source.id, controllerId: controller.id, label: "准备", workflow: defaultWorkflow, workflowVersion: 1 } });
    current = await read();
    await assert.rejects(save({ ...input, id, version: current.version }), /准备或直播/);
    // 模拟账号被外部同步封禁后的旧准备页提交，服务端仍拒绝开播。
    await db.douyinAccount.update({ where: { id }, data: { active: false, banned: true } });
    await assert.rejects(db.$transaction(tx => runWorkCommand(tx, controller.id, { id: session.id, version: session.version, command: "start", time: shanghaiInput(new Date()) }, "test")), /封禁/);
    await db.workSession.update({ where: { id: session.id }, data: { phase: "WRAP" } });
    await save({ ...input, id, version: current.version, active: "false" });
    assert.equal((await read()).banned, false); assert.equal((await read()).unbanDate, null);
    const history = await db.accountRecord.findMany({ where: { accountId: id } });
    assert(history.some(r => r.banned && r.unbanDate === "2026-10-15"));
    assert(history.some(r => r.banned && r.unbanDate === "2000-01-01"));
    assert(await db.auditLog.count({ where: { targetId: id, action: "ACCOUNT_UPDATE" } }));
    console.log("PASS: 封禁日期校验/待定、到期不自动解封、权限、禁止准备/开播、执行中禁止改状态、手机号换绑保留、历史与恢复清理");
  } finally {
    try { if (verified) {
      const ids = (await db.douyinAccount.findMany({ where: { douyinId: marker }, select: { id: true } })).map(x => x.id);
      await db.workSession.deleteMany({ where: { accountId: { in: ids } } });
      await db.accountRecord.deleteMany({ where: { accountId: { in: ids } } });
      await db.douyinAccount.deleteMany({ where: { id: { in: ids } } });
      await db.phoneNumber.deleteMany({ where: { branch: { name: marker } } });
      await cleanupRun(db, marker);
    } } finally { await db.$disconnect(); }
  }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(e => { console.error(e); process.exitCode = 1; });
