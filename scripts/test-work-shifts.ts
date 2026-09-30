import assert from "node:assert/strict";
import { saveAccount } from "../modules/accounts/service";
import { shanghaiInput } from "../modules/live-reports/schema";
import { defaultWorkflow } from "../modules/workbench/schema";
import { runWorkCommand, saveWorkflow, readWorkSession } from "../modules/workbench/service";
import { readShift, readShiftHistory, runShiftCommand } from "../modules/workbench/shifts";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";

async function main() {
  const { dbName } = validateTestEnv(), db = resolveTestClient(), marker = newRunId();
  let verified = false;
  try {
    await assertTestDatabase(db, dbName); verified = true;
    const branch = await db.branch.create({ data: { name: `${marker}-a` } });
    const otherBranch = await db.branch.create({ data: { name: `${marker}-b` } });
    async function user(name: string, role: "BOSS" | "CONTROLLER" | "OPERATOR" | "ANCHOR", branchId: string | null, employmentStatus: "ACTIVE" | "RESIGNED" = "ACTIVE") {
      const u = await db.user.create({ data: { username: `${marker}-${name}`, name, role, branchId, employmentStatus, passwordHash: "not-a-real-hash", mustChangePassword: false } });
      const token = `${marker}-${name}`;
      await db.session.create({ data: { id: token, userId: u.id, expiresAt: new Date(Date.now() + 3600000) } });
      return { ...u, token };
    }
    const boss = await user("boss", "BOSS", null);
    const a = await user("a", "CONTROLLER", branch.id);
    const b = await user("b", "CONTROLLER", branch.id);
    const actual = await user("actual", "OPERATOR", branch.id);
    const substitute = await user("substitute", "OPERATOR", branch.id);
    const left = await user("left", "OPERATOR", branch.id, "RESIGNED");
    const remote = await user("remote", "CONTROLLER", otherBranch.id);
    const anchor = await user("anchor", "ANCHOR", branch.id);
    const shift = (token: string, data: object) => db.$transaction(tx => runShiftCommand(tx, token, data, "test"));
    const work = (token: string, data: object) => db.$transaction(tx => runWorkCommand(tx, token, data, "test"));
    const state = (token: string) => db.$transaction(tx => readShift(tx, token));
    const history = (token: string) => db.$transaction(tx => readShiftHistory(tx, token, 1));
    async function account(name: string, controllerId: string) {
      const id = await db.$transaction(tx => saveAccount(tx, boss.token, { id: "", version: 0, douyinId: `${marker}-${name}`, name, homepageUrl: "", realName: "", phone: "", purpose: "", notes: "", branchId: branch.id, controllerId, operatorId: actual.id, anchorId: anchor.id, active: "true" }, "test"));
      await db.$transaction(tx => saveWorkflow(tx, boss.token, id, 0, defaultWorkflow, "test"));
      return id;
    }
    const accountA = await account("account-a", a.id);
    const accountB = await account("account-b", b.id);
    const accountC = await account("account-c", b.id);
    const accountD = await account("account-d", b.id);
    await assert.rejects(work(a.token, { id: accountA, version: 0, command: "create" }), /上班/);
    await assert.rejects(shift(remote.token, { command: "shiftStart" }), /分配/);
    const shiftA = await shift(a.token, { command: "shiftStart" });
    const races = await Promise.allSettled([shift(b.token, { command: "shiftStart" }), shift(b.token, { command: "shiftStart" })]);
    assert.equal(races.filter(r => r.status === "fulfilled").length, 1);
    const shiftB = (await state(b.token)).shift!.id;
    await assert.rejects(shift(a.token, { command: "shiftStart" }), /已有/);
    assert.equal(await db.workShift.count({ where: { userId: a.id, endedAt: null } }), 1);
    assert.equal(await db.workShift.count({ where: { userId: b.id, endedAt: null } }), 1);

    // 跨上海自然日仍沿用同一条未结束上班记录。
    const yesterday = new Date(Date.now() - 24 * 3600000);
    await db.workShift.update({ where: { id: shiftA }, data: { startedAt: yesterday } });
    await db.workShift.update({ where: { id: shiftB }, data: { startedAt: new Date(Date.now() - 30 * 60000) } });
    const sessionA = await work(a.token, { id: accountA, version: 0, command: "create", label: "手填名称应忽略", actualControllerId: actual.id });
    const created = await db.workSession.findUniqueOrThrow({ where: { id: sessionA } });
    assert.equal(created.shiftId, shiftA);
    assert.equal(created.loginUserId, a.id);
    assert.equal(created.loginUserName, a.name);
    assert.equal(created.actualControllerId, actual.id);
    assert.equal(created.actualControllerName, actual.name);
    assert.notEqual(created.label, "手填名称应忽略");
    assert.match(created.label, / 场$/);
    assert.notEqual(shanghaiInput((await state(a.token)).shift!.startedAt).slice(0, 10), shanghaiInput(created.createdAt).slice(0, 10));
    await assert.rejects(work(a.token, { id: accountA, version: 0, command: "create" }), /已有/);

    await assert.rejects(work(b.token, { id: accountB, version: 0, command: "create", actualControllerId: remote.id }), /本分公司在职/);
    await assert.rejects(work(b.token, { id: accountB, version: 0, command: "create", actualControllerId: left.id }), /本分公司在职/);
    const sessionB = await work(b.token, { id: accountB, version: 0, command: "create" });
    await assert.rejects(work(b.token, { id: sessionB, version: 1, command: "controller", actualControllerId: remote.id }), /本分公司在职/);
    await assert.rejects(work(b.token, { id: sessionB, version: 1, command: "controller", actualControllerId: left.id }), /本分公司在职/);
    await work(b.token, { id: sessionB, version: 1, command: "controller", actualControllerId: a.id });
    assert.equal((await db.workSession.findUniqueOrThrow({ where: { id: sessionB } })).actualControllerId, a.id);
    const sessionC = await work(b.token, { id: accountC, version: 0, command: "create", actualControllerId: actual.id });
    await assert.rejects(shift(b.token, { command: "shiftEnd", id: shiftB, version: 1 }), /场次/);
    await assert.rejects(shift(b.token, { command: "shiftCheck", id: shiftA, version: 1, item: "sound" }), /不存在/);
    assert.equal((await state(b.token)).shift!.id, shiftB);
    assert.equal((await history(b.token)).some(s => s.id === shiftA), false);
    assert.equal((await history(boss.token)).some(s => s.id === shiftA), true);
    await assert.rejects(shift(a.token, { command: "shiftCheck", id: shiftA, version: 0, item: "sound" }), /已更新/);
    await assert.rejects(shift(a.token, { command: "shiftCheck", id: shiftA, version: 1, item: "sound", status: "issue" }), /原因/);
    await shift(a.token, { command: "shiftCheck", id: shiftA, version: 1, item: "sound", status: "issue", note: "麦克风无声" });
    await db.workSession.update({ where: { id: sessionA }, data: { createdAt: new Date(Date.now() - 20 * 60000) } });
    await assert.rejects(work(a.token, { id: sessionA, version: 1, command: "start", time: shanghaiInput(new Date(Date.now() - 10 * 60000)), note: "准备已核对" }), /声音、画面、网络/);
    await shift(a.token, { command: "shiftCheck", id: shiftA, version: 2, item: "sound", status: "normal", note: "更换麦克风" });
    for (const [index, item] of (["picture", "network"] as const).entries()) await shift(a.token, { command: "shiftCheck", id: shiftA, version: index + 3, item, status: "normal" });
    assert.equal(((await state(a.token)).shift!.checks as { sound: { status: string } }).sound.status, "normal");
    const changes = (await history(a.token)).find(s => s.id === shiftA)!.changes;
    assert(changes.some(c => JSON.stringify(c.detail).includes("麦克风无声")));
    assert(changes.some(c => JSON.stringify(c.detail).includes("更换麦克风")));

    const startTime = shanghaiInput(new Date(Date.now() - 10 * 60000));
    await db.workSession.updateMany({ where: { id: { in: [sessionA, sessionB, sessionC] } }, data: { createdAt: new Date(Date.now() - 20 * 60000) } });
    await assert.rejects(work(b.token, { id: sessionB, version: 2, command: "start", time: startTime, note: "准备已核对" }), /声音、画面、网络/);
    for (const [index, item] of (["sound", "picture", "network"] as const).entries()) await shift(b.token, { command: "shiftCheck", id: shiftB, version: index + 1, item, status: "normal" });
    await work(a.token, { id: sessionA, version: 1, command: "start", time: startTime, note: "准备已核对" });
    await assert.rejects(work(b.token, { id: sessionB, version: 2, command: "start", time: startTime, note: "准备已核对" }), /重叠|直播中/);
    await assert.rejects(work(b.token, { id: sessionC, version: 1, command: "start", time: startTime, note: "准备已核对" }), /重叠|直播中/);
    await assert.rejects(work(a.token, { id: sessionA, version: 2, command: "controller", actualControllerId: b.id }), /开播前/);
    assert.equal((await db.workSession.findUniqueOrThrow({ where: { id: sessionA } })).actualControllerId, actual.id);
    await assert.rejects(shift(a.token, { command: "shiftEnd", id: shiftA, version: 5 }), /场次/);
    assert.equal((await state(a.token)).unfinished, 1);
    await work(a.token, { id: sessionA, version: 2, command: "end", time: shanghaiInput(new Date(Date.now() - 5 * 60000)), note: "未完成事项已记录" });
    await assert.rejects(shift(a.token, { command: "shiftEnd", id: shiftA, version: 5 }), /场次/);
    let version = 3;
    for (let index = 0; index < defaultWorkflow.after.length; index++) await work(a.token, { id: sessionA, version: version++, command: "check", phase: "after", index, status: "done" });
    await work(a.token, { id: sessionA, version: version++, command: "violation", violation: "no" });
    await work(a.token, { id: sessionA, version, command: "complete", incident: "no" });
    await shift(a.token, { command: "shiftCheck", id: shiftA, version: 5, item: "computer", status: "normal" });
    await shift(a.token, { command: "shiftEarlyEnd", id: shiftA, version: 6, reason: "测试提前结束" });
    assert.equal((await state(a.token)).shift, null);
    assert.equal((await history(a.token)).find(s => s.id === shiftA)!.sessions[0].id, sessionA);
    const secondShiftA = await shift(a.token, { command: "shiftStart" });
    assert.notEqual(secondShiftA, shiftA);
    await assert.rejects(shift(a.token, { command: "shiftCheck", id: shiftA, version: 7, item: "computer" }), /不存在/);

    // 两场的账号原主责相同；实际登录人和执行人均不同，不应被旧 controllerId 唯一索引拦截。
    const bossShift = await shift(boss.token, { command: "shiftStart" });
    await db.workShift.update({ where: { id: bossShift }, data: { startedAt: new Date(Date.now() - 30 * 60000) } });
    for (const [index, item] of (["sound", "picture", "network"] as const).entries()) await shift(boss.token, { command: "shiftCheck", id: bossShift, version: index + 1, item, status: "normal" });
    const bossSession = await work(boss.token, { id: accountD, version: 0, command: "create", actualControllerId: substitute.id });
    await db.workSession.update({ where: { id: bossSession }, data: { createdAt: new Date(Date.now() - 20 * 60000) } });
    await work(b.token, { id: sessionB, version: 2, command: "controller", actualControllerId: b.id });
    const parallelTime = shanghaiInput(new Date(Date.now() - 10 * 60000));
    await work(b.token, { id: sessionB, version: 3, command: "start", time: parallelTime, note: "准备已核对" });
    await work(boss.token, { id: bossSession, version: 1, command: "start", time: parallelTime, note: "准备已核对" });
    const bothLive = await db.workSession.findMany({ where: { id: { in: [sessionB, bossSession] }, phase: "LIVE" } });
    assert.equal(bothLive.length, 2);
    assert(bothLive.every(s => s.controllerId === b.id));
    assert.deepEqual(new Set(bothLive.map(s => s.loginUserId)).size, 2);
    assert.deepEqual(new Set(bothLive.map(s => s.actualControllerId)).size, 2);
    async function finish(token: string, id: string) {
      let v = (await db.workSession.findUniqueOrThrow({ where: { id } })).version;
      await work(token, { id, version: v++, command: "end", time: shanghaiInput(new Date(Date.now() - 5 * 60000)), note: "未完成事项已记录" });
      for (let index = 0; index < defaultWorkflow.after.length; index++) await work(token, { id, version: v++, command: "check", phase: "after", index, status: "done" });
      await work(token, { id, version: v++, command: "violation", violation: "no" });
      await work(token, { id, version: v, command: "complete", incident: "no" });
    }
    await finish(b.token, sessionB);
    await finish(boss.token, bossSession);
    await shift(boss.token, { command: "shiftCheck", id: bossShift, version: 4, item: "computer", status: "normal" });
    await shift(boss.token, { command: "shiftEarlyEnd", id: bossShift, version: 5, reason: "测试提前结束" });

    // 取消准备可结束上班；执行记录与审计在同一事务中回滚。
    await work(b.token, { id: sessionC, version: 1, command: "cancel", note: "本场取消" });
    const before = await db.auditLog.count({ where: { targetType: "WorkShift", targetId: shiftB } });
    await assert.rejects(db.$transaction(async tx => { await runShiftCommand(tx, b.token, { command: "shiftCheck", id: shiftB, version: 4, item: "computer", status: "normal" }, "test"); throw new Error("rollback"); }), /rollback/);
    assert.equal((await db.workShift.findUniqueOrThrow({ where: { id: shiftB } })).version, 4);
    assert.equal(await db.auditLog.count({ where: { targetType: "WorkShift", targetId: shiftB } }), before);
    await shift(b.token, { command: "shiftCheck", id: shiftB, version: 4, item: "computer", status: "normal" });
    await shift(b.token, { command: "shiftEarlyEnd", id: shiftB, version: 5, reason: "测试提前结束" });
    for (const [index, item] of (["computer", "sound", "picture", "network"] as const).entries()) await shift(a.token, { command: "shiftCheck", id: secondShiftA, version: index + 1, item, status: "normal" });
    await shift(a.token, { command: "shiftEarlyEnd", id: secondShiftA, version: 5, reason: "测试提前结束" });

    // 旧场次没有新增字段，仍可按原负责人读取，并保留原有执行权限。
    const record = await db.accountRecord.findFirstOrThrow({ where: { accountId: accountC, endedAt: null } });
    const legacy = await db.workSession.create({ data: { accountId: accountC, sourceRecordId: record.id, controllerId: b.id, label: "旧场次", workflow: defaultWorkflow, workflowVersion: 1 } });
    assert.equal(legacy.shiftId, null);
    assert.equal(legacy.loginUserId, null);
    assert.equal(legacy.actualControllerId, null);
    assert.equal((await db.$transaction(tx => readWorkSession(tx, b.token, legacy.id)))?.session.id, legacy.id);
    assert.equal((await db.$transaction(tx => readWorkSession(tx, b.token, legacy.id)))?.editable, true);
    assert.equal((await db.$transaction(tx => readWorkSession(tx, a.token, legacy.id))), null);
    await work(b.token, { id: legacy.id, version: 1, command: "cancel", note: "兼容性测试结束" });
    console.log("PASS: 班次跨日、重复与并发、设备修复审计、人员校验和冲突、结束门槛、隔离与回滚、旧场次兼容");
  } finally {
    try { if (verified) {
      const accounts = await db.douyinAccount.findMany({ where: { douyinId: { startsWith: marker } }, select: { id: true } });
      const ids = accounts.map(a => a.id);
      const sessions = await db.workSession.findMany({ where: { accountId: { in: ids } }, select: { id: true } });
      await db.workEvent.deleteMany({ where: { sessionId: { in: sessions.map(s => s.id) } } });
      await db.workSession.deleteMany({ where: { accountId: { in: ids } } });
      await db.workShift.deleteMany({ where: { userId: { in: (await db.user.findMany({ where: { username: { startsWith: marker } }, select: { id: true } })).map(u => u.id) } } });
      await db.accountWorkflow.deleteMany({ where: { accountId: { in: ids } } });
      await db.accountRecord.deleteMany({ where: { accountId: { in: ids } } });
      await db.douyinAccount.deleteMany({ where: { id: { in: ids } } });
      await cleanupRun(db, marker);
    } } finally { await db.$disconnect(); }
  }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(e => { console.error(e); process.exitCode = 1; });
