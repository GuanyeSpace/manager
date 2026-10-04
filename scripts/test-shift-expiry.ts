import assert from "node:assert/strict";
import { runShiftCommand } from "../modules/workbench/shifts";
import { runWorkCommand, saveWorkflow } from "../modules/workbench/service";
import { isShiftExpired, SHIFT_MAXIMUM_MS, defaultWorkflow } from "../modules/workbench/schema";
import { shanghaiInput } from "../modules/live-reports/schema";
import { saveAccount } from "../modules/accounts/service";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
async function main() {
  const { dbName } = validateTestEnv(), db = resolveTestClient(), marker = newRunId(); let verified = false;
  try {
    await assertTestDatabase(db, dbName); verified = true;
    const now = Date.now(), base = { clockStartedAt: new Date(now - SHIFT_MAXIMUM_MS), createdAt: new Date(now), endedAt: null };
    assert.equal(isShiftExpired(base, now - 1), false); assert.equal(isShiftExpired(base, now), true);
    assert.equal(isShiftExpired({ ...base, endedAt: new Date(now) }, now), false);
    assert.equal(isShiftExpired({ ...base, clockStartedAt: null, createdAt: base.clockStartedAt }, now), true);
    const branch = await db.branch.create({ data: { name: marker } });
    const users: { id: string; token: string }[] = [];
    for (const role of ["BOSS", "CONTROLLER", "ANCHOR", "CONTROLLER"] as const) {
      const u = await db.user.create({ data: { username: marker + users.length, name: role, role, branchId: branch.id, passwordHash: "test-only", mustChangePassword: false } });
      const token = marker + u.id; await db.session.create({ data: { id: token, userId: u.id, expiresAt: new Date(now + 3600000) } }); users.push({ ...u, token });
    }
    const [boss, controller, anchor, other] = users;
    const accountId = await db.$transaction(tx => saveAccount(tx, boss.token, { id: "", version: 0, douyinId: marker, name: "超时验收", homepageUrl: "", realName: "", phone: "", purpose: "", notes: "", branchId: branch.id, operatorId: "", controllerId: controller.id, anchorId: anchor.id, active: "true" }, "test"));
    await db.$transaction(tx => saveWorkflow(tx, boss.token, accountId, 0, { ...defaultWorkflow, before: [], live: [], after: [] }, "test"));
    const run = (data: object, token = controller.token) => db.$transaction(tx => runShiftCommand(tx, token, data, "test"));
    const work = (data: object) => db.$transaction(tx => runWorkCommand(tx, controller.token, { version: 0, ...data }, "test"));
    const id = await run({ command: "shiftStart" });
    const get = () => db.workShift.findUniqueOrThrow({ where: { id } });
    const command = async (command: string, extra: object = {}, token = controller.token) => run({ command, id, version: (await get()).version, ...extra }, token);
    await assert.rejects(command("shiftMissedEnd", { reason: "忘记", endedAt: shanghaiInput(new Date(now)) }), /仅超时/);
    await db.workShift.update({ where: { id }, data: { startedAt: new Date(now - 72 * 3600000), clockStartedAt: new Date(now - 72 * 3600000) } });
    await assert.rejects(work({ command: "create", id: accountId }), /超时/);
    await command("shiftCorrectTime", { startedAt: shanghaiInput(new Date(now - 70 * 3600000)), reason: "核对" });
    await assert.rejects(work({ command: "create", id: accountId }), /超时/);
    await assert.rejects(command("shiftMissedEnd", { reason: "忘记", endedAt: shanghaiInput(new Date(now - 24 * 3600000)) }, other.token), /不存在/);
    await assert.rejects(command("shiftMissedEnd", { endedAt: shanghaiInput(new Date(now - 24 * 3600000)) }), /原因/);
    await assert.rejects(command("shiftMissedEnd", { reason: "忘记", endedAt: shanghaiInput(new Date(now + 3600000)) }), /不晚于/);
    await assert.rejects(command("shiftMissedEnd", { reason: "忘记", endedAt: shanghaiInput(new Date(now - 80 * 3600000)) }), /晚于到岗/);
    // Create just below the limit, then crossing it blocks start, including backdated actual times.
    await db.workShift.update({ where: { id }, data: { clockStartedAt: new Date(now - SHIFT_MAXIMUM_MS + 60000) } });
    let sessionId = await work({ command: "create", id: accountId });
    await db.workShift.update({ where: { id }, data: { clockStartedAt: new Date(now - SHIFT_MAXIMUM_MS) } });
    await assert.rejects(work({ command: "start", id: sessionId, version: 1, time: shanghaiInput(new Date(now)), reason: "补登" }), /超时/);
    await assert.rejects(command("shiftMissedEnd", { endedAt: shanghaiInput(new Date(now)), reason: "忘记" }), /处理全部/);
    await work({ command: "cancel", id: sessionId, version: 1, note: "取消准备" });
    await assert.rejects(command("shiftMissedEnd", { endedAt: shanghaiInput(new Date(now - 3600000)), reason: "忘记" }), /准备时间/);
    // Simulate actual preparation yesterday, with cancellation/cleanup performed today.
    await db.workSession.update({ where: { id: sessionId }, data: { createdAt: new Date(now - 30 * 3600000) } });
    const originalChecks = (await get()).checks;
    const version = (await get()).version;
    const request = { command: "shiftMissedEnd", id, version, endedAt: shanghaiInput(new Date(now - 24 * 3600000)) + ":15", reason: "昨日漏下班，今日补填" };
    const races = await Promise.allSettled([run(request), run(request)]);
    assert.equal(races.filter(r => r.status === "fulfilled").length, 1);
    const ended = await get(); assert.ok(ended.missedEndRecordedAt); assert.ok(ended.endedAt! < ended.missedEndRecordedAt); assert.deepEqual(ended.checks, originalChecks); assert.equal(ended.checkedInAt, null);
    await command("shiftCorrectTime", { startedAt: shanghaiInput(ended.startedAt), endedAt: shanghaiInput(new Date(now - 23 * 3600000)), reason: "更正实际离岗" });
    assert.equal((await get()).missedEndRecordedAt?.toISOString(), ended.missedEndRecordedAt.toISOString());
    await assert.rejects(command("shiftCorrectTime", { startedAt: shanghaiInput(ended.startedAt), endedAt: shanghaiInput(new Date(now - 31 * 3600000)), reason: "过早" }), /不能早于/);
    assert.ok(await db.auditLog.findFirst({ where: { targetId: id, detail: { path: ["command"], equals: "shiftMissedEnd" } } }));
    const newId = await run({ command: "shiftStart" });
    const fresh = await db.workShift.findUniqueOrThrow({ where: { id: newId } }); assert.deepEqual(fresh.checks, {}); assert.equal(fresh.checkedInAt, null); assert.equal(fresh.missedEndRecordedAt, null);
    await db.workShift.update({ where: { id: newId }, data: { startedAt: new Date(now - 2 * 3600000) } });
    for (const item of ["computer", "sound", "picture", "network"]) {
      const s = await db.workShift.findUniqueOrThrow({ where: { id: newId } });
      await run({ command: "shiftCheck", id: newId, version: s.version, item, status: "normal" });
    }
    sessionId = await work({ command: "create", id: accountId });
    await work({ command: "start", id: sessionId, version: 1, time: shanghaiInput(new Date(now - 3600000)), reason: "补登" });
    await db.workShift.update({ where: { id: newId }, data: { clockStartedAt: null, createdAt: new Date(now - 72 * 3600000) } });
    await work({ command: "end", id: sessionId, version: 2, time: shanghaiInput(new Date(now - 1800000)) });
    const openShift = await db.workShift.findUniqueOrThrow({ where: { id: newId } });
    await assert.rejects(run({ command: "shiftMissedEnd", id: newId, version: openShift.version, reason: "忘记", endedAt: shanghaiInput(new Date(now)) }), /处理全部/);
    await work({ command: "complete", id: sessionId, version: 3, incident: "no" });
    await assert.rejects(run({ command: "shiftMissedEnd", id: newId, version: openShift.version, reason: "忘记", endedAt: shanghaiInput(new Date(now - 1900000)) }), /实际下播/);
    await run({ command: "shiftMissedEnd", id: newId, version: openShift.version, reason: "忘记", endedAt: shanghaiInput(new Date(now - 1200000)) });
    await db.session.delete({ where: { id: controller.token } }); await assert.rejects(run({ command: "shiftStart" }), /登录或权限/);
    console.log("PASS: 16h boundary, immutable clock, legacy/cross-day, start block, live continuation, missing checks preserved, actual vs operation time, corrections, races, audit, fresh shift, permissions");
  } finally {
    try { if (verified) {
      const ids = (await db.user.findMany({ where: { username: { startsWith: marker } }, select: { id: true } })).map(u => u.id);
      const sessions = (await db.workSession.findMany({ where: { account: { douyinId: { startsWith: marker } } }, select: { id: true } })).map(s => s.id);
      await db.workEvent.deleteMany({ where: { sessionId: { in: sessions } } });
      await db.workSession.deleteMany({ where: { id: { in: sessions } } });
      await db.workShift.deleteMany({ where: { userId: { in: ids } } });
      await db.accountWorkflow.deleteMany({ where: { account: { douyinId: { startsWith: marker } } } });
      await db.accountRecord.deleteMany({ where: { account: { douyinId: { startsWith: marker } } } });
      await db.douyinAccount.deleteMany({ where: { douyinId: { startsWith: marker } } });
      await cleanupRun(db, marker);
    } } finally { await db.$disconnect(); }
  }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(e => { console.error(e); process.exitCode = 1; });
