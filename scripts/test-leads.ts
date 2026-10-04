import { previewReadToken } from "../lib/auth/read-actor";
import { readComparison } from "../modules/settlements/comparison";
import assert from "node:assert/strict";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
import { saveAccount } from "../modules/accounts/service";
import { readLeadClaim, readLeadList, readLeadTask, runLeadCommand } from "../modules/leads/service";
import { leadValues, leadFields } from "../modules/leads/schema";
import { readLiveReport, readLiveReports } from "../modules/live-reports/data";
import { saveMonetization } from "../modules/live-reports/monetization-service";
import { recycleLiveReport } from "../modules/live-reports/recycle-service";
import { signSessionToken } from "../lib/auth/session-token";
import type { Role } from "../app/generated/prisma/enums";

async function main() {
  const { dbName } = validateTestEnv(), db = resolveTestClient(), marker = newRunId();
  let verified = false;
  try {
    await assertTestDatabase(db, dbName); verified = true;
    const a = await db.branch.create({ data: { name: marker + "-a" } }), b = await db.branch.create({ data: { name: marker + "-b" } });
    async function user(name: string, role: Role, branchId: string | null) {
      const u = await db.user.create({ data: { username: marker + name, name, role, branchId, passwordHash: "not-real", mustChangePassword: false } });
      const token = marker + name; await db.session.create({ data: { id: token, userId: u.id, expiresAt: new Date(Date.now() + 3600000) } }); return { ...u, token };
    }
    const boss = await user("boss", "BOSS", null), lead = await user("lead", "LEAD_SPECIALIST", a.id), lead2 = await user("lead2", "LEAD_SPECIALIST", a.id), remote = await user("remote", "LEAD_SPECIALIST", b.id), manager = await user("manager", "ASSISTANT", a.id), manager2 = await user("manager2", "ASSISTANT", b.id), operator = await user("operator", "OPERATOR", a.id), unrelated = await user("unrelated", "OPERATOR", a.id), controller = await user("controller", "CONTROLLER", a.id);
    await db.branch.update({ where: { id: a.id }, data: { managerId: manager.id } }); await db.branch.update({ where: { id: b.id }, data: { managerId: manager2.id } });
    const controller2 = await user("controller2", "CONTROLLER", a.id);
    const accountInput = { id: "", version: 0, douyinId: marker + "account", name: "导粉权限测试", homepageUrl: "", realName: "", phone: "", purpose: "", notes: "", branchId: a.id, operatorId: operator.id, controllerId: controller.id, anchorId: "", active: "true" as const };
    const accountId = await db.$transaction(tx => saveAccount(tx, boss.token, accountInput, "test"));
    const source = await db.accountRecord.findFirstOrThrow({ where: { accountId } });
    async function session(phase: "LIVE" | "PREPARING" | "CANCELLED" | "COMPLETE", minutes: number, leadEligible = true) {
      const chosenAccount = (phase === "PREPARING" || minutes === 120) ? await db.$transaction(tx => saveAccount(tx, boss.token, { ...accountInput, douyinId: marker + String(minutes), controllerId: minutes === 120 ? controller2.id : controller.id }, "test")) : accountId;
      const chosenSource = chosenAccount === accountId ? source : await db.accountRecord.findFirstOrThrow({ where: { accountId: chosenAccount } });
      return db.workSession.create({ data: { accountId: chosenAccount, sourceRecordId: chosenSource.id, controllerId: chosenSource.controllerId!, label: "导粉测试" + minutes, phase, workflow: {}, workflowVersion: 1, leadEligible, startedAt: ["LIVE", "COMPLETE"].includes(phase) ? new Date(Date.now() - minutes * 60000) : null, endedAt: phase === "COMPLETE" ? new Date(Date.now() - (minutes - 10) * 60000) : null } });
    }
    const live = await session("LIVE", 60), done = await session("LIVE", 120), old = await session("COMPLETE", 180, false), cancelled = await session("CANCELLED", 240), preparing = await session("PREPARING", 300);
    const cmd = (token: string, raw: object) => db.$transaction(tx => runLeadCommand(tx, token, raw, "test"));
    const claim = (token: string, id: string) => cmd(token, { id, version: 0, command: "claim" });
    const read = (token: string, id: string) => db.$transaction(tx => readLeadTask(tx, token, id));
    const list = (token: string, view: string) => db.$transaction(tx => readLeadList(tx, token, view));
    assert.deepEqual((await list(lead.token, "available")).sessions.map(s => s.id).sort(), [live.id, done.id].sort());
    assert.equal((await list(remote.token, "available")).count, 0);
    for (const s of [old, cancelled, preparing]) await assert.rejects(claim(lead.token, s.id), /不能认领/);
    // D063: a controller with a secondary lead role sees every controller's eligible sessions.
    await db.user.update({ where: { id: lead.id }, data: { role: "CONTROLLER", roles: ["LEAD_SPECIALIST"] } });
    const preview = previewReadToken(boss.token, "leads", lead.id);
    for (const phase of ["LIVE", "WRAP", "COMPLETE"] as const) {
      for (const outcome of [null, "NORMAL", "VIOLATION_STOP", "VIOLATION_BAN", "EQUIPMENT", "OTHER_INTERRUPTION", "INTERRUPTED"]) {
        await db.workSession.update({ where: { id: done.id }, data: { phase, outcome } });
        const actual = await list(lead.token, "available"), viewed = await list(preview, "available");
        assert.deepEqual(viewed.sessions.map(s => s.id), actual.sessions.map(s => s.id));
        assert(actual.sessions.some(s => s.id === done.id));
        assert(await db.$transaction(tx => readLeadClaim(tx, preview, done.id)));
      }
    }
    await db.workSession.update({ where: { id: done.id }, data: { phase: "LIVE", outcome: null } });
    await assert.rejects(claim(preview, done.id), /只读预览/);
    await db.user.update({ where: { id: lead.id }, data: { role: "LEAD_SPECIALIST", roles: [] } });
    await assert.rejects(claim(remote.token, live.id), /不能认领/);
    await assert.rejects(claim(controller.token, live.id), /仅导粉/);
    const concurrent = await Promise.allSettled([claim(lead.token, live.id), claim(lead2.token, live.id)]);
    assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 1);
    let task = await db.leadTask.findUniqueOrThrow({ where: { sessionId: live.id } });
    const owner = task.userId === lead.id ? lead : lead2, other = task.userId === lead.id ? lead2 : lead;
    assert.equal(await read(other.token, task.id), null); assert.equal(await read(controller.token, task.id), null); assert.equal(await read(remote.token, task.id), null); assert.equal(await read(manager2.token, task.id), null);
    const second = await claim(owner.token, done.id); assert.equal((await list(owner.token, "work")).count, 2);
    const save = async (data: object, command = "save", token = owner.token, id = task.id, reason = "") => cmd(token, { id, version: (await db.leadTask.findUniqueOrThrow({ where: { id } })).version, command, data, reason });
    const values = leadValues({ exposureCount: "100", entryCount: "0", effectiveCount: "" });
    await save(values); task = await db.leadTask.findUniqueOrThrow({ where: { id: task.id } });
    assert.equal(leadValues(task.data).entryCount, "0"); assert.equal(leadValues(task.data).effectiveCount, ""); assert.equal(await db.liveReport.count({ where: { workSessionId: live.id } }), 0);
    const editRace = await Promise.allSettled([cmd(owner.token, { id: task.id, version: task.version, command: "save", data: { ...values, exposureCount: "101" } }), cmd(manager.token, { id: task.id, version: task.version, command: "save", data: { ...values, exposureCount: "102" } })]);
    assert.equal(editRace.filter(r => r.status === "fulfilled").length, 1);
    await assert.rejects(save(values, "complete"), /请补齐/);
    const full = leadValues(Object.fromEntries(leadFields.map(([k]) => [k, "0"]))); full.leadMode = "yes"; full.durationMinutes = "10"; full.durationText = "10分钟"; full.averageStayMinutes = "2.9";
    await assert.rejects(save({ ...full, averageOnline: "2", peakOnline: "1" }), /平均在线/);
    await assert.rejects(save({ ...full, effectiveCount: "2", backendJoinCount: "1" }), /有效人数/);
    await assert.rejects(save(full, "complete"), /实际下播/);
    await assert.rejects(save(full, "save", operator.token), /无修改权限/);
    await assert.rejects(cmd(owner.token, { id: task.id, version: 1, command: "save", data: full }), /已被修改/);
    await db.workSession.update({ where: { id: live.id }, data: { phase: "WRAP", endedAt: new Date(Date.now() - 40 * 60000), outcome: "INTERRUPTED" } });
    await assert.rejects(save({ ...full, femalePercent: "", age31To40Percent: "" }, "complete"), /请补齐/);
    await assert.rejects(save({ ...full, femalePercent: "100.01" }), /画像比例/);
    await assert.rejects(save({ ...full, durationText: "错误时长" }), /直播时长/);
    full.femalePercent = "65.32%"; full.age31To40Percent = "100%";
    await assert.rejects(save({...full,leadMode:""}, "complete"), /本场是否导粉/);
    await save(full, "complete"); task = await db.leadTask.findUniqueOrThrow({ where: { id: task.id } }); assert.ok(task.completedAt);
    const report = await db.liveReport.findUniqueOrThrow({ where: { workSessionId: live.id } }); assert.equal(report.hasSales, null); assert.equal(report.salesGmv, null); assert.equal(report.effectiveCount, 0);
    for (const u of [boss, manager, operator, owner]) assert.ok(await db.$transaction(tx => readLiveReport(tx, u.token, report.id)));
    for (const u of [controller, other, remote, manager2, unrelated]) assert.equal(await db.$transaction(tx => readLiveReport(tx, u.token, report.id)), null);
    await assert.rejects(save({ ...full, likeCount: "2" }), /更正原因/);
    await save({ ...full, likeCount: "2" }, "save", manager.token, task.id, "核对平台修正点赞次数");
    assert.equal((await db.liveReport.findUniqueOrThrow({ where: { id: report.id } })).likeCount, 2);
    assert.equal((await db.liveReport.findUniqueOrThrow({ where: { id: report.id } })).femaleHundredths, 6532);
    await assert.rejects(save({ ...full, femalePercent: "" }, "save", manager.token, task.id, "不允许清空"), /不能清空/);
    // 模拟旧完成资料：缺画像但有已废弃字段和未知扩展字段。
    const existingTask = await db.leadTask.findUniqueOrThrow({ where: { id: task.id } });
    const legacyData = { ...(existingTask.data as Record<string, unknown>), femalePercent: "", age31To40Percent: "", longPressCount: "9", legacyNote: "保留" };
    delete (legacyData as Record<string, unknown>).formVersion;
    delete (legacyData as Record<string, unknown>).leadMode;
    await db.leadTask.update({ where: { id: task.id }, data: { data: legacyData } });
    await db.liveReport.update({ where: { id: report.id }, data: { femaleHundredths: null, age31To40Hundredths: null, longPressCount: 9, hasSales: true, salesGmv: "88.50" } });
    await save({ ...full, leadMode:"", femalePercent: "", age31To40Percent: "", likeCount: "3" }, "save", manager.token, task.id, "旧完成记录更正");
    const preserved = await db.liveReport.findUniqueOrThrow({ where: { id: report.id } });
    assert.equal(preserved.isLeadGeneration,null); assert.equal(preserved.femaleHundredths, null); assert.equal(preserved.longPressCount, 9); assert.equal(preserved.salesGmv?.toFixed(2), "88.50");
    const preservedData = (await db.leadTask.findUniqueOrThrow({ where: { id: task.id } })).data as Record<string, unknown>;
    assert.equal(preservedData.legacyNote, "保留"); assert.equal(preservedData.longPressCount, "9");
    await save(full, "save", manager.token, task.id, "补录画像");
    await assert.rejects(save({ ...full, femalePercent: "" }, "save", manager.token, task.id, "旧记录也不可清空"), /不能清空/);
    const money = { id: report.id, version: "2", fanGroupCount: "0", linkClickCount: "0", longPressCount: "0", backendJoinCount: "0", effectiveCount: "0", salesStatus: "UNFILLED", salesGmv: "", reason: "绕过" };
    await assert.rejects(db.$transaction(tx => saveMonetization(tx, boss.token, money, "test")), /导粉场次页面/);
    await assert.rejects(db.$transaction(tx => recycleLiveReport(tx, boss.token, { id: report.id, version: 2, section: "report", operation: "delete", confirmed: "yes", reason: "绕过" }, "test")), /导粉场次页面/);
    const admin = async (command: string, extras = {}, token = manager.token) => cmd(token, { id: task.id, version: (await db.leadTask.findUniqueOrThrow({ where: { id: task.id } })).version, command, ...extras });
    await assert.rejects(admin("correctOwner", { userId: other.id, reason: "换人" }, owner.token), /仅老板/);
    await assert.rejects(admin("correctOwner", { userId: other.id }), /操作原因/);
    await assert.rejects(admin("correctOwner", { userId: remote.id, reason: "错误" }), /本分公司/);
    await admin("correctOwner", { userId: other.id, reason: "认领时误选了场次" });
    assert.equal(await read(owner.token, task.id), null); assert.ok(await read(other.token, task.id)); assert.equal((await read(other.token, task.id))!.history.length >= 4, true);
    assert.equal(await db.$transaction(tx => readLiveReport(tx, owner.token, report.id)), null);
    await assert.rejects(admin("delete", { reason: "员工删除" }, other.token), /仅老板/);
    await admin("delete", { reason: "误录测试" }); assert.ok((await db.liveReport.findUniqueOrThrow({ where: { id: report.id } })).deletedAt);
    assert.equal((await list(other.token, "trash")).count, 1); assert.equal((await list(other.token, "completed")).count, 0);
    await assert.rejects(save(full, "save", other.token, task.id, "更正"), /已删除/);
    await admin("restore", { reason: "恢复核对" }); assert.equal((await db.liveReport.findUniqueOrThrow({ where: { id: report.id } })).deletedAt, null);
    const beforeRollback = await db.leadTask.findUniqueOrThrow({ where: { id: task.id } });
    await assert.rejects(db.$transaction(async tx => { await runLeadCommand(tx, manager.token, { id: task.id, version: beforeRollback.version, command: "save", data: { ...full, likeCount: "4" }, reason: "回滚" }, "test"); throw Error("rollback"); }), /rollback/);
    assert.equal((await db.leadTask.findUniqueOrThrow({ where: { id: task.id } })).version, beforeRollback.version);
    // 调拨后保持原分公司；离职后由负责人补齐，原认领人不变。
    await db.douyinAccount.update({ where: { id: accountId }, data: { branchId: b.id, operatorId: null } });
    assert.ok(await read(manager.token, task.id)); assert.equal(await read(manager2.token, task.id), null); assert.equal(await read(operator.token, task.id), null);
    await db.user.update({ where: { id: owner.id }, data: { employmentStatus: "RESIGNED" } });
    await assert.rejects(read(owner.token, second), /登录或权限/);
    await db.workSession.update({ where: { id: done.id }, data: { phase: "COMPLETE", endedAt: new Date(Date.now() - 100 * 60000) } });
    await save(full, "complete", manager.token, second); assert.equal((await db.leadTask.findUniqueOrThrow({ where: { id: second } })).userId, owner.id);
    assert.equal((await db.$transaction(tx => readLiveReports(tx, controller.token, { accountId: "", from: "", to: "", page: 1 }))).count, 0);
    // 不导粉仅校验直播指标，未填数字不转换为0，历史原值保留。
    const noPowder = {...full,leadMode:"no",fanGroupCount:"",linkClickCount:"",backendJoinCount:"",effectiveCount:""};
    await assert.rejects(save(noPowder,"save",manager.token,second),/更正原因/);
    await save(noPowder,"save",manager.token,second,"本场未导粉");
    const noReport = await db.liveReport.findUniqueOrThrow({where:{workSessionId:done.id}});
    assert.equal(leadValues((await db.leadTask.findUniqueOrThrow({where:{id:second}})).data).backendJoinCount,"0"); assert.equal(noReport.isLeadGeneration,false); assert.equal(noReport.effectiveCount,0);
    let filtered=await db.$transaction(tx=>readLiveReports(tx,boss.token,{view:"monetization",page:1,accountId}));
    assert(!filtered.reports.some(r=>r.id===noReport.id));
    filtered=await db.$transaction(tx=>readLiveReports(tx,boss.token,{view:"monetization",page:1,accountId:done.accountId,leadMode:"no"}));
    assert.equal(filtered.count,1);assert.equal(filtered.summary.powderSessions,0);assert.equal(filtered.summary.incomplete,0);
    await assert.rejects(save({...noPowder,leadMode:"yes"},"save",manager.token,second,"改回导粉"),/请补齐/);
    await save({...noPowder,fanGroupCount:"暂存文字"},"save",manager.token,second,"无关草稿保留");
    assert.equal(leadValues((await db.leadTask.findUniqueOrThrow({where:{id:second}})).data).fanGroupCount,"暂存文字");
    await save({...full,leadMode:"no"},"save",manager.token,task.id,"另场也未导粉");
    assert.equal((await db.$transaction(tx=>readComparison(tx,boss.token,{from:"2000-01-01",to:"2099-01-01"}))).rows.length,0);
    await save(full,"save",manager.token,second,"恢复导粉");
    assert.equal((await db.liveReport.findUniqueOrThrow({where:{workSessionId:done.id}})).isLeadGeneration,true);
    await db.douyinAccount.update({where:{id:accountId},data:{branchId:a.id}});
    const fresh=await claim(other.token,(await session("COMPLETE",400)).id);
    await save(noPowder,"complete",other.token,fresh);
    const freshTask=await db.leadTask.findUniqueOrThrow({where:{id:fresh}});
    const freshReport=await db.liveReport.findUniqueOrThrow({where:{workSessionId:freshTask.sessionId}});
    assert.equal(freshReport.effectiveCount,null);assert.equal(freshReport.isLeadGeneration,false);
    // D059: confirmation reads never claim; actual personnel do not gain access.
    const available = await session("COMPLETE", 500);
    const detail = await db.$transaction(tx => readLeadClaim(tx, other.token, available.id));
    assert.equal(detail?.defaultPersonId, other.id);
    assert(detail?.people.some(p => p.id === controller.id));
    assert(!detail?.people.some(p => p.id === remote.id));
    assert.equal(await db.leadTask.count({ where: { sessionId: available.id } }), 0);
    await assert.rejects(cmd(other.token, { id: available.id, version: 0, command: "claim", actualLeadId: remote.id }), /本分公司/);
    const claimed = await cmd(other.token, { id: available.id, version: 0, command: "claim", actualLeadId: controller.id });
    let ct = await db.leadTask.findUniqueOrThrow({ where: { id: claimed } });
    assert.equal(ct.userId, other.id); assert.equal(ct.actualLeadId, controller.id);
    assert.equal(await read(controller.token, claimed), null);
    await cmd(other.token, { id: claimed, version: ct.version, command: "save", data: values });
    ct = await db.leadTask.findUniqueOrThrow({ where: { id: claimed } });
    await assert.rejects(cmd(other.token, { id: claimed, version: ct.version, command: "release" }), /原因/);
    await assert.rejects(cmd(boss.token, { id: claimed, version: ct.version, command: "release", reason: "不是本人" }), /本人/);
    await assert.rejects(db.$transaction(async tx => { await runLeadCommand(tx, other.token, { id: claimed, version: ct.version, command: "release", reason: "回滚" }, "test"); throw Error("rollback"); }), /rollback/);
    assert.equal((await db.leadTask.findUniqueOrThrow({ where: { id: claimed } })).releasedAt, null);
    await cmd(other.token, { id: claimed, version: ct.version, command: "release", reason: "选错场次" });
    const released = await db.leadTask.findUniqueOrThrow({ where: { id: claimed } });
    assert(released.releasedAt); assert.deepEqual(released.data, ct.data);
    assert.equal(await read(other.token, claimed), null);
    assert((await list(other.token, "available")).sessions.some(s => s.id === available.id));
    await assert.rejects(cmd(other.token, { id: claimed, version: ct.version, command: "save", data: full }), /无修改权限/);
    await assert.rejects(cmd(boss.token, { id: claimed, version: released.version, command: "restore", reason: "绕过撤销" }), /无修改权限/);
    assert.equal(await claim(other.token, available.id), claimed);
    ct = await db.leadTask.findUniqueOrThrow({ where: { id: claimed } });
    assert.deepEqual(ct.data, {}); assert(ct.version > released.version);
    await assert.rejects(cmd(other.token, { id: claimed, version: released.version, command: "save", data: full }), /已被修改/);
    await save(full, "complete", other.token, claimed);
    ct = await db.leadTask.findUniqueOrThrow({ where: { id: claimed } });
    await assert.rejects(cmd(other.token, { id: claimed, version: ct.version, command: "release", reason: "已经完成" }), /已提交完成/);
    await cmd(boss.token, { id: claimed, version: ct.version, command: "correctActual", actualLeadId: controller.id, reason: "真实代班人员" });
    ct = await db.leadTask.findUniqueOrThrow({ where: { id: claimed } }); assert.equal(ct.userId, other.id);
    const byPerson = await db.$transaction(tx => readLiveReports(tx, boss.token, { leadId: controller.id, page: 1 }));
    assert(byPerson.reports.some(r => r.workSessionId === available.id));
    assert(!(await db.$transaction(tx => readLiveReports(tx, controller.token, { page: 1 }))).count);
    const splitSession = await session("COMPLETE", 600);
    await db.workSession.update({ where: { id: splitSession.id }, data: { liveDataRole: "CONTROLLER", liveDataSubmittedAt: new Date(), liveDataDraft: full } });
    const { id: oldReportId, ...reportFields } = report; void oldReportId;
    const splitReport = await db.liveReport.create({ data: { ...reportFields, startedAt:splitSession.startedAt!, workSessionId: splitSession.id } });
    const splitTask = await claim(other.token, splitSession.id);
    await save({ ...values, leadMode: "no" }, "save", other.token, splitTask);
    const splitBefore = await db.leadTask.findUniqueOrThrow({ where: { id: splitTask } });
    await cmd(other.token, { id: splitTask, version: splitBefore.version, command: "release", reason: "误领" });
    assert.deepEqual(await db.liveReport.findUniqueOrThrow({ where: { id: splitReport.id } }), splitReport);
    assert.equal(await db.$transaction(tx => readLiveReport(tx, other.token, splitReport.id)), null);
    assert.equal((await db.$transaction(tx => readLiveReport(tx, boss.token, splitReport.id)))?.report.leadName, "未记录");
    await claim(other.token, splitSession.id);
    assert.deepEqual((await db.leadTask.findUniqueOrThrow({ where: { id: splitTask } })).data, {});
    assert((await db.auditLog.findMany({ where: { targetId: claimed } })).some(a => JSON.stringify(a.detail).includes("选错场次")));
    console.log("PASS D059: confirmation, actual personnel, release/reclaim, audit/version, completed guard, personnel filter and controller data preservation");
    const base = process.env.TEST_HTTP_BASE;
    if (base) {
      const login = await fetch(base + "/login", { headers: { Cookie: `session=${signSessionToken(other.token)}` }, redirect: "manual" });
      assert.equal(login.status, 307);
      const home = await fetch(base + "/", { headers: { Cookie: `session=${signSessionToken(other.token)}` }, redirect: "manual" });
      assert.equal(home.status, 307); assert.ok(home.headers.get("location")?.endsWith("/leads"));
      for (const [u, path, text] of [[other, `/leads/${task.id}`, "认领与数据修改记录"], [manager, "/leads?view=completed", "已完成场次"], [remote, "/leads?view=available", "暂无可认领场次"]] as const) {
        const response: Response = await fetch(base + path, { headers: { Cookie: `session=${signSessionToken(u.token)}` }, redirect: "manual" });
        assert.equal(response.status, 200, path); assert.match((await response.text()).replace(/<!--.*?-->/g, ""), new RegExp(text));
      }
      for (const u of [controller, remote, owner]) { const response: Response = await fetch(base + `/leads/${task.id}`, { headers: { Cookie: `session=${signSessionToken(u.token)}` }, redirect: "manual" }); assert.ok([404, 307].includes(response.status), `${u.name} ${response.status}`); }
    }
    console.log("PASS: 认领竞态、多场并行、历史排除、分公司与角色隔离、草稿空白和零、完成校验、误认领纠正、离职补填、调拨归属、旧接口保护、回收站、审计、事务回滚与HTTP");
  } finally {
    try { if (verified) {
      const accounts = await db.douyinAccount.findMany({ where: { douyinId: { startsWith: marker } }, select: { id: true } }), ids = accounts.map(a => a.id);
      await db.leadTask.deleteMany({ where: { session: { accountId: { in: ids } } } });
      await db.liveReport.deleteMany({ where: { accountId: { in: ids } } }); await db.workSession.deleteMany({ where: { accountId: { in: ids } } }); await db.accountRecord.deleteMany({ where: { accountId: { in: ids } } }); await db.douyinAccount.deleteMany({ where: { id: { in: ids } } });
      await db.branch.updateMany({ where: { name: { startsWith: marker } }, data: { managerId: null } }); await cleanupRun(db, marker);
    } } finally { await db.$disconnect(); }
  }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(e => { console.error(e); process.exitCode = 1; });
