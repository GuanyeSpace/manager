import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
import { saveAccount } from "../modules/accounts/service";
import { supplementSession, recycleSession, readManagedSessions } from "../modules/workbench/management";
import { readWorkSession, readWorkHistory, runWorkCommand, saveWorkflow } from "../modules/workbench/service";
import { readScreenshot, submitWorkCommand } from "../modules/workbench/screenshots";
import { runLeadCommand, readLeadList } from "../modules/leads/service";
import { recycleLiveReport } from "../modules/live-reports/recycle-service";
import { shanghaiInput } from "../modules/live-reports/schema";
import { defaultWorkflow } from "../modules/workbench/schema";
import { signSessionToken } from "../lib/auth/session-token";
async function main() {
  const { dbName } = validateTestEnv(), db = resolveTestClient(), marker = newRunId();
  const directory = await mkdtemp(path.join(os.tmpdir(), "manager-session-management-"));
  process.env.WORK_SCREENSHOT_DIR = directory;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
  const time = (n: number) => shanghaiInput(new Date(Date.now() - n * 60000));
  let verified = false;
  try {
    await assertTestDatabase(db, dbName); verified = true;
    const branch = await db.branch.create({ data: { name: `${marker}-branch` } });
    async function user(name: string, role: "BOSS" | "CONTROLLER" | "LEAD_SPECIALIST") {
      const u = await db.user.create({ data: { username: `${marker}-${name}`, name, role, branchId: branch.id, passwordHash: "not-a-real-hash", mustChangePassword: false } });
      const token = `${marker}-${u.id}`; await db.session.create({ data: { id: token, userId: u.id, expiresAt: new Date(Date.now() + 3600000) } }); return { ...u, token };
    }
    const boss = await user("管理验收老板", "BOSS"), control = await user("管理验收中控", "CONTROLLER"), lead = await user("管理验收导粉", "LEAD_SPECIALIST");
    const account = await db.$transaction(tx => saveAccount(tx, boss.token, { id: "", version: 0, douyinId: `${marker}-a`, name: "场次管理验收账号", homepageUrl: "", realName: "", phone: "", purpose: "", notes: "", branchId: branch.id, controllerId: control.id, operatorId: "", anchorId: "", active: "true" }, "test"));
    await db.$transaction(tx => saveWorkflow(tx, boss.token, account, 0, defaultWorkflow, "test"));
    const source = await db.accountRecord.findFirstOrThrow({ where: { accountId: account } });
    const base = { id: `${marker}-s1`, accountId: account, sourceRecordId: source.id, actualControllerId: control.id, label: "补录晚场", kind: "complete", time: time(120), endedAt: time(60), reason: "漏记补录" };
    const supplement = (data: object, token = boss.token) => db.$transaction(tx => supplementSession(tx, token, data, "test"));
    const get = (id: string) => db.workSession.findUniqueOrThrow({ where: { id } });
    const recycle = async (id: string, operation: string, token = boss.token, reason = "验收原因") => db.$transaction(tx => recycleSession(tx, token, { id, operation, reason, version: 1 }, "test"));
    await assert.rejects(supplement(base, control.token), /仅老板/);
    await assert.rejects(supplement(base, "expired"));
    await assert.rejects(supplement({ ...base, reason: "" }));
    await assert.rejects(supplement({ ...base, endedAt: time(140) }), /晚于/);
    await assert.rejects(supplement({ ...base, endKind: "equipment" }), /截图/);
    await assert.rejects(db.$transaction(async tx => { await supplementSession(tx, boss.token, { ...base, id: `${marker}-rollback` }, "test"); throw Error("模拟事务失败"); }), /模拟事务失败/);
    assert.equal(await db.workSession.count({ where: { id: `${marker}-rollback` } }), 0);
    assert.equal(await db.auditLog.count({ where: { targetId: `${marker}-rollback` } }), 0);
    const id = await supplement(base), row = await get(id);
    assert.equal(row.phase, "COMPLETE"); assert.equal(row.loginUserId, null); assert.equal(row.shiftId, null); assert.deepEqual(row.progress, {}); assert.equal(row.workflowVersion, 0); assert(row.supplementedAt);
    await assert.rejects(supplement(base), /已提交/);
    await assert.rejects(supplement({ ...base, id: `${marker}-overlap` }), /重叠/);
    await assert.rejects(recycle(id, "delete", control.token), /仅老板/);
    await assert.rejects(recycle(id, "delete", boss.token, ""));
    const task = await db.$transaction(tx => runLeadCommand(tx, lead.token, { command: "claim", id, version: 0 }, "test"));
    await assert.rejects(recycle(id, "delete"), /关联/);
    await db.$transaction(tx => runLeadCommand(tx, boss.token, { command: "delete", id: task, version: 1, reason: "误认领" }, "test"));
    const results = await Promise.allSettled([recycle(id, "delete"), recycle(id, "delete")]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(await db.$transaction(tx => readWorkSession(tx, control.token, id)), null);
    const bossRead = await db.$transaction(tx => readWorkSession(tx, boss.token, id)); assert.equal(bossRead!.editable, false);
    assert(!(await db.$transaction(tx => readWorkHistory(tx, boss.token, 1))).some(s => s.id === id));
    await assert.rejects(db.$transaction(tx => runWorkCommand(tx, boss.token, { command: "correct", id, version: 2, kind: "times", startedAt: time(119), endedAt: time(59), reason: "修改" }, "test")), /权限/);
    await assert.rejects(db.$transaction(tx => runLeadCommand(tx, boss.token, { command: "restore", id: task, version: 2, reason: "恢复" }, "test")), /恢复关联场次/);
    const replacement = await supplement({ ...base, id: `${marker}-replacement` });
    await assert.rejects(db.$transaction(tx => recycleSession(tx, boss.token, { id, version: 2, operation: "restore", reason: "恢复" }, "test")), /重叠/);
    await recycle(replacement, "delete");
    await db.$transaction(tx => recycleSession(tx, boss.token, { id, version: 2, operation: "restore", reason: "恢复" }, "test"));
    assert((await db.leadTask.findUniqueOrThrow({ where: { id: task } })).deletedAt);
    // Active rows cannot be recycled even through a direct request.
    const active = await db.workSession.create({ data: { accountId: account, sourceRecordId: source.id, controllerId: control.id, label: "准备中", workflow: defaultWorkflow, workflowVersion: 1 } });
    await assert.rejects(recycle(active.id, "delete"), /归档/);
    await db.workSession.update({ where: { id: active.id }, data: { phase: "CANCELLED" } });
    await recycle(active.id, "delete");
    const upload = async (kind: string, n: number) => {
      const form = new FormData(); for (const [k,v] of Object.entries({ ...base, id: `${marker}-${kind}`, command: "supplement", kind: kind === "unstarted" ? "unstarted" : "complete", time: time(n), endedAt: time(n-5), endKind: kind === "unstarted" ? "normal" : kind, failureReason: kind === "unstarted" ? "设备故障" : "", note: "验收异常原因" })) form.set(k,v);
      form.set("screenshots", new File([new Uint8Array(png)], "test.png", { type: "image/png" })); return submitWorkCommand(db, boss.token, form, "test");
    };
    const unstarted = await upload("unstarted", 200);
    assert.equal((await get(unstarted)).startedAt, null);
    const unstartedFile = await db.workScreenshot.findFirstOrThrow({ where: { sessionId: unstarted } });
    await recycle(unstarted,"delete");
    assert.equal(await db.$transaction(tx => readScreenshot(tx, control.token, unstartedFile.id)), null);
    assert(await db.$transaction(tx => readScreenshot(tx, boss.token, unstartedFile.id)));
    for (const [i,kind] of ["violation_stop","violation_ban","equipment","other"].entries()) {
      const s = await get(await upload(kind, 250 + i * 10)); assert.equal(s.hasViolation, kind.startsWith("violation")); assert.equal(s.hasOtherIncident, !kind.startsWith("violation"));
    }
    assert(!(await db.douyinAccount.findUniqueOrThrow({ where: { id: account } })).banned);
    const available = await db.$transaction(tx => readLeadList(tx, lead.token, "available")); assert(!available.sessions.some(s => s.id === unstarted));
    for (const size of [10,20,50]) { const list = await db.$transaction(tx => readManagedSessions(tx, boss.token, { accountId: account, pageSize: String(size), userId: control.id })); assert(list.rows.every(s => s.accountId === account && !s.deletedAt)); assert.equal(list.pageSize,size); }
    await assert.rejects(db.$transaction(tx => readManagedSessions(tx, control.token, {})), /仅老板/);
    const reportSession = await supplement({ ...base, id: `${marker}-report`, time: time(400), endedAt: time(390) });
    const report = await db.liveReport.create({ data: { accountId: account, sourceRecordId: source.id, branchId: branch.id, branchName: branch.name, accountName: source.name, douyinId: source.douyinId, createdById: boss.id, createdByName: boss.name, updatedByName: boss.name, startedAt: (await get(reportSession)).startedAt!, durationSeconds: 600, sessionLabel: "历史报表", exposureCount: 10, entryCount: 5, averageOnline: 2, peakOnline: 3, averageStayHundredths: 100, commenterCount: 1, likeCount: 1, newFollowers: 1, shareCount: 1, newFanClubMembers: 1, workSessionId: reportSession } });
    await assert.rejects(recycle(reportSession, "delete"), /关联/);
    await db.$transaction(tx => recycleLiveReport(tx, boss.token, { id: report.id, version: 1, section: "report", operation: "delete", confirmed: "yes", reason: "处理关联" }, "test"));
    await recycle(reportSession, "delete");
    await assert.rejects(db.$transaction(tx => recycleLiveReport(tx, boss.token, { id: report.id, version: 2, section: "report", operation: "restore", confirmed: "yes", reason: "测试恢复保护" }, "test")), /恢复关联场次/);
    assert.equal((await db.liveReport.findUniqueOrThrow({ where: { id: report.id } })).entryCount, 5);
    const audits = await db.auditLog.count({ where: { targetId: id } }); assert(audits >= 3);
    console.log("PASS: supplement, screenshots, conflict, permissions, concurrent recycle, linked restore, visibility, filters, audit");
    if (process.env.TEST_UI_HOLD === "true") {
      await db.workShift.create({ data: { userId: control.id, userName: control.name, branchId: branch.id, startedAt: new Date(Date.now()-3600000), checks: {}, } });
      await writeFile("/tmp/manager-session-management-ui.json", JSON.stringify({ marker, bossCookie: signSessionToken(boss.token), controlCookie: signSessionToken(control.token), account, id, screenshotDirectory: directory }), { mode: 0o600 });
      console.log("UI fixture ready; press Enter to clean up"); await new Promise<void>(resolve => process.stdin.once("data", () => resolve()));
    }
  } finally {
    if (verified) {
      const accounts = await db.douyinAccount.findMany({ where: { douyinId: { startsWith: marker } }, select: { id: true } }); const ids = accounts.map(a => a.id);
      const sessions = await db.workSession.findMany({ where: { accountId: { in: ids } }, select: { id: true } }); const sessionIds = sessions.map(s => s.id);
      await db.workScreenshot.deleteMany({ where: { sessionId: { in: sessionIds } } }); await db.workEvent.deleteMany({ where: { sessionId: { in: sessionIds } } }); await db.liveReport.deleteMany({ where: { accountId: { in: ids } } }); await db.leadTask.deleteMany({ where: { sessionId: { in: sessionIds } } }); await db.workSession.deleteMany({ where: { accountId: { in: ids } } }); await db.accountWorkflow.deleteMany({ where: { accountId: { in: ids } } }); await db.accountRecord.deleteMany({ where: { accountId: { in: ids } } }); await db.douyinAccount.deleteMany({ where: { id: { in: ids } } });
      const users = await db.user.findMany({ where: { username: { startsWith: marker } }, select: { id: true } }); await db.workShift.deleteMany({ where: { userId: { in: users.map(u => u.id) } } });
      await cleanupRun(db, marker);
    }
    await db.$disconnect(); await rm(directory, { recursive: true, force: true }); await rm("/tmp/manager-session-management-ui.json", { force: true });
  }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(e => { console.error(e); process.exitCode = 1; });
