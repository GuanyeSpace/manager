import assert from "node:assert/strict";
import { runShiftCommand } from "../modules/workbench/shifts";
import { completedCheckCount, type EquipmentChecks } from "../modules/workbench/schema";
import { shanghaiInput } from "../modules/live-reports/schema";
import { saveAccount } from "../modules/accounts/service";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
async function main() {
  const { dbName } = validateTestEnv(), db = resolveTestClient(), marker = newRunId(); let verified = false;
  try {
    await assertTestDatabase(db, dbName); verified = true;
    const tokens: string[] = [], users: string[] = [];
    for (let i = 0; i < 2; i++) {
      const u = await db.user.create({ data: { username: marker + i, name: "测试", role: "BOSS", passwordHash: "test-only", mustChangePassword: false } });
      const token = marker + "-session" + i; users.push(u.id); tokens.push(token);
      await db.session.create({ data: { id: token, userId: u.id, expiresAt: new Date(Date.now() + 3600000) } });
    }
    const run = (data: object, token = tokens[0]) => db.$transaction(tx => runShiftCommand(tx, token, data, "test"));
    const id = await run({ command: "shiftStart", startedAt: shanghaiInput(new Date(Date.now() - 10 * 3600000)), reason: "补登" });
    const get = () => db.workShift.findUniqueOrThrow({ where: { id } });
    const command = async (command: string, extra: object = {}, token = tokens[0]) => run({ command, id, version: (await get()).version, ...extra }, token);
    const first = await get(); assert.ok(first.clockStartedAt); assert.equal(first.checkedInAt, null);
    assert.ok(first.clockStartedAt.getTime() > first.startedAt.getTime() + 9 * 3600000);
    await assert.rejects(command("shiftEnd"), /四项/);
    await assert.rejects(command("shiftEarlyEnd", { reason: "离岗" }), /四项/);
    await assert.rejects(command("shiftCheck", { item: "computer", status: "normal" }, tokens[1]), /不存在/);
    await assert.rejects(command("shiftCheck", { item: "computer" }), /请选择/);
    await assert.rejects(command("shiftCheck", { item: "computer", status: "issue", note: "  " }), /原因/);
    const v = (await get()).version;
    const races = await Promise.allSettled([run({ command: "shiftCheck", id, version: v, item: "computer", status: "normal" }), run({ command: "shiftCheck", id, version: v, item: "sound", status: "normal" })]);
    assert.equal(races.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(completedCheckCount((await get()).checks as EquipmentChecks), 1);
    for (const item of ["computer", "sound", "picture", "network"]) if (!(await get()).checks || !((await get()).checks as EquipmentChecks)[item as keyof EquipmentChecks]) await command("shiftCheck", { item, status: item === "network" ? "issue" : "normal", note: item === "network" ? "测速不足" : "" });
    const completed = await get(); assert.ok(completed.checkedInAt); assert.equal(completedCheckCount(completed.checks as EquipmentChecks), 4);
    assert.equal((completed.checks as EquipmentChecks).network?.status, "issue");
    await command("shiftCheck", { item: "network", status: "normal" });
    assert.equal((await get()).checkedInAt?.toISOString(), completed.checkedInAt.toISOString());
    assert.equal((await get()).clockStartedAt?.toISOString(), first.clockStartedAt.toISOString());
    await command("shiftCorrectTime", { startedAt: shanghaiInput(new Date(Date.now() - 11 * 3600000)), reason: "更正" });
    assert.equal((await get()).clockStartedAt?.toISOString(), first.clockStartedAt.toISOString());
    await assert.rejects(command("shiftEnd"), /未满8小时/);
    await assert.rejects(command("shiftEarlyEnd"), /原因/);
    const audits = await db.auditLog.count({ where: { targetId: id } });
    await assert.rejects(db.$transaction(async tx => { await runShiftCommand(tx, tokens[0], { command: "shiftEarlyEnd", id, version: (await get()).version, reason: "测试" }, "test"); throw Error("rollback"); }), /rollback/);
    assert.equal((await get()).endedAt, null); assert.equal(await db.auditLog.count({ where: { targetId: id } }), audits);
    const branch = await db.branch.create({ data: { name: marker } });
    const accountId = await db.$transaction(tx => saveAccount(tx, tokens[0], { id: "", version: 0, douyinId: marker, name: "测试", homepageUrl: "", realName: "", phone: "", purpose: "", notes: "", branchId: branch.id, operatorId: "", controllerId: users[0], anchorId: "", active: "true" }, "test"));
    const source = await db.accountRecord.findFirstOrThrow({ where: { accountId } });
    const session = await db.workSession.create({ data: { accountId, sourceRecordId: source.id, controllerId: users[0], loginUserId: users[0], shiftId: id, workflow: {}, workflowVersion: 1, label: "待处理" } });
    for (const phase of ["PREPARING", "LIVE", "WRAP"] as const) {
      await db.workSession.update({ where: { id: session.id }, data: { phase } });
      await assert.rejects(command("shiftEnd"), /场次/); await assert.rejects(command("shiftEarlyEnd", { reason: "测试" }), /场次/);
    }
    await db.workSession.update({ where: { id: session.id }, data: { phase: "CANCELLED" } });
    await command("shiftEarlyEnd", { reason: "临时请假" });
    assert.equal((await get()).earlyEndReason, "临时请假");
    assert.ok((await get()).endedAt);
    await assert.rejects(command("shiftEnd"), /不存在/);
    // Legacy ongoing shifts use immutable creation time, including across midnight.
    const oldId = await db.workShift.create({ data: { userId: users[1], userName: "旧员工", startedAt: new Date(Date.now() - 12 * 3600000), createdAt: new Date(Date.now() - (8 * 60 - 1) * 60000), checks: completed.checks! } });
    await assert.rejects(run({ command: "shiftEnd", id: oldId.id, version: 1 }, tokens[1]), /未满8小时/);
    await db.workShift.update({ where: { id: oldId.id }, data: { createdAt: new Date(Date.now() - 8 * 3600000) } });
    await run({ command: "shiftEnd", id: oldId.id, version: 1 }, tokens[1]);
    const old = await db.workShift.findUniqueOrThrow({ where: { id: oldId.id } }); assert.equal(old.checkedInAt, null); assert.equal(old.clockStartedAt, null); assert.equal(old.earlyEndReason, null);
    await db.session.delete({ where: { id: tokens[0] } }); await assert.rejects(run({ command: "shiftStart" }), /登录或权限/);
    console.log("PASS: four checks, abnormal attendance, immutable clock, 7h59/8h boundaries, early exit, unfinished work, races, audit rollback, legacy and revoked session");
  } finally {
    try { if (verified) {
      const users = await db.user.findMany({ where: { username: { startsWith: marker } }, select: { id: true } });
      const ids = users.map(u => u.id);
      await db.workSession.deleteMany({ where: { account: { douyinId: { startsWith: marker } } } });
      await db.workShift.deleteMany({ where: { userId: { in: ids } } });
      await db.accountRecord.deleteMany({ where: { account: { douyinId: { startsWith: marker } } } });
      await db.douyinAccount.deleteMany({ where: { douyinId: { startsWith: marker } } });
      await cleanupRun(db, marker);
    } } finally { await db.$disconnect(); }
  }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(e => { console.error(e); process.exitCode = 1; });
