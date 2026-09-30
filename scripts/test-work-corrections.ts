import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
import { saveAccount } from "../modules/accounts/service";
import { saveWorkflow, runWorkCommand, readWorkSession } from "../modules/workbench/service";
import { runShiftCommand, readShiftHistory } from "../modules/workbench/shifts";
import { submitWorkCommand } from "../modules/workbench/screenshots";
import { defaultWorkflow, type Progress } from "../modules/workbench/schema";
import { shanghaiInput } from "../modules/live-reports/schema";
import { signSessionToken } from "../lib/auth/session-token";

async function main() {
  const { dbName } = validateTestEnv(), db = resolveTestClient(), marker = newRunId();
  const directory = await mkdtemp(path.join(os.tmpdir(), "manager-corrections-"));
  const oldDirectory = process.env.WORK_SCREENSHOT_DIR; process.env.WORK_SCREENSHOT_DIR = directory;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
  const baseTime = Math.floor(Date.now() / 60000) * 60000;
  const ago = (minutes: number) => new Date(baseTime - minutes * 60000);
  const time = (minutes: number) => shanghaiInput(ago(minutes));
  let verified = false;
  try {
    await assertTestDatabase(db, dbName); verified = true;
    const branch = await db.branch.create({ data: { name: `${marker}-branch` } });
    const remote = await db.branch.create({ data: { name: `${marker}-remote` } });
    async function user(name: string, role: "BOSS" | "CONTROLLER" | "ANCHOR", branchId: string | null) {
      const u = await db.user.create({ data: { username: `${marker}-${name}`, name, role, branchId, passwordHash: "not-a-real-hash", mustChangePassword: false } });
      const token = `${marker}-${name}`; await db.session.create({ data: { id: token, userId: u.id, expiresAt: new Date(Date.now() + 3600000) } }); return { ...u, token };
    }
    const boss = await user("boss", "BOSS", null), control = await user("control", "CONTROLLER", branch.id), other = await user("other", "CONTROLLER", branch.id), helper = await user("helper", "CONTROLLER", branch.id), stranger = await user("stranger", "CONTROLLER", remote.id), anchor = await user("anchor", "ANCHOR", branch.id);
    const accountInput = { id: "", version: 0, douyinId: `${marker}-a`, name: "更正测试账号", homepageUrl: "", realName: "", phone: "", purpose: "", notes: "", branchId: branch.id, controllerId: control.id, operatorId: "", anchorId: anchor.id, active: "true" as const };
    const account = await db.$transaction(tx => saveAccount(tx, boss.token, accountInput, "test"));
    const accountB = await db.$transaction(tx => saveAccount(tx, boss.token, { ...accountInput, douyinId: `${marker}-b`, controllerId: other.id }, "test"));
    const workflow = { ...defaultWorkflow, before: [defaultWorkflow.before[0]], live: [], after: [defaultWorkflow.after[0]] };
    for (const id of [account, accountB]) await db.$transaction(tx => saveWorkflow(tx, boss.token, id, 0, workflow, "test"));
    const work = (token: string, data: object) => db.$transaction(tx => runWorkCommand(tx, token, data, "test"));
    const shift = (token: string, data: object) => db.$transaction(tx => runShiftCommand(tx, token, data, "test"));
    const get = (id: string) => db.workSession.findUniqueOrThrow({ where: { id } });
    const correct = async (id: string, data: object, token = control.token) => work(token, { id, version: (await get(id)).version, command: "correct", reason: "核对真实情况后更正", ...data });
    async function upload(id: string, data: Record<string, string>, token = control.token) {
      const form = new FormData(); for (const [k, v] of Object.entries({ id, version: String((await get(id)).version), command: "correct", reason: "补充正确的图片", ...data })) form.set(k, v);
      form.set("screenshots", new File([new Uint8Array(png)], "test.png", { type: "image/png" }));
      return submitWorkCommand(db, token, form, "test");
    }
    await assert.rejects(shift(control.token, { command: "shiftStart", startedAt: time(120) }), /补填.*原因/);
    await assert.rejects(shift(control.token, { command: "shiftStart", startedAt: time(-10), reason: "错误未来" }), /不晚于/);
    const sid = await shift(control.token, { command: "shiftStart", startedAt: time(120), reason: "先到岗检查，忘记登记" });
    assert.equal((await db.workShift.findUniqueOrThrow({ where: { id: sid } })).startedAt.toISOString(), ago(120).toISOString());
    const shiftAudit = await db.auditLog.findFirstOrThrow({ where: { targetId: sid } }); assert.equal((shiftAudit.detail as { reason: string }).reason, "先到岗检查，忘记登记");
    for (const [i, item] of ["sound", "picture", "network"].entries()) await shift(control.token, { command: "shiftCheck", id: sid, version: i + 1, item, status: "normal" });
    const id = await work(control.token, { id: account, version: 0, command: "create" });
    await assert.rejects(correct(id, { kind: "controller", actualControllerId: helper.id }), /先完成/);
    await assert.rejects(work(control.token, { id, version: 1, command: "start", time: time(60), note: "延迟记录" }), /补填原因/);
    await work(control.token, { id, version: 1, command: "start", time: time(60), note: "已做设备准备", reason: "忘记登记实际开播" });
    await work(control.token, { id, version: 2, command: "end", time: time(50) });
    await work(control.token, { id, version: 3, command: "check", phase: "after", index: 0, status: "done" });
    await work(control.token, { id, version: 4, command: "violation", violation: "no" });
    await work(control.token, { id, version: 5, command: "complete", incident: "no" });
    const original = await get(id), completedAt = (original.progress as Progress)["after:0"].at;
    await assert.rejects(correct(id, { kind: "times", startedAt: time(61), endedAt: time(49), reason: "" }), /更正原因/);
    await assert.rejects(correct(id, { kind: "times", startedAt: time(61), endedAt: time(49) }, other.token), /更正权限/);
    await assert.rejects(correct(id, { kind: "times", startedAt: time(121), endedAt: time(49) }), /上班范围/);
    await assert.rejects(correct(id, { kind: "times", startedAt: time(30), endedAt: time(49) }), /晚于开播/);
    await assert.rejects(correct(id, { kind: "times", startedAt: time(61), endedAt: time(-1) }), /不晚于/);
    await db.workSession.update({ where: { id }, data: { startedAt: new Date(ago(60).getTime() + 12345) } });
    await correct(id, { kind: "times", startedAt: time(60), endedAt: time(49) });
    assert.equal((await get(id)).startedAt!.getTime(), ago(60).getTime() + 12345);
    assert.equal((await get(id)).createdAt.toISOString(), original.createdAt.toISOString());
    await correct(id, { kind: "task", phase: "after", index: 0, status: "done", note: "补充原处理说明", at: "2000-01-01T00:00:00Z" });
    assert.equal(((await get(id)).progress as Progress)["after:0"].at, completedAt);
    await correct(id, { kind: "task", phase: "after", index: 0, status: "issue", note: "原勾选错误，有设备异常" });
    assert.notEqual(((await get(id)).progress as Progress)["after:0"].at, completedAt);
    assert.equal((await get(id)).phase, "COMPLETE");
    await assert.rejects(correct(id, { kind: "task", phase: "after", index: 0, status: "pending" }), /Invalid option/);
    await assert.rejects(correct(id, { kind: "controller", actualControllerId: stranger.id }), /本分公司/);
    await correct(id, { kind: "controller", actualControllerId: helper.id });
    assert.equal((await get(id)).loginUserId, control.id);
    assert.equal((await get(id)).actualControllerId, helper.id);
    await assert.rejects(correct(id, { kind: "violation", violation: "yes", note: "复查违规" }), /上传截图/);
    await upload(id, { kind: "violation", violation: "yes", note: "复查发现违规" });
    assert.equal((await get(id)).hasViolation, true);
    await correct(id, { kind: "violation", violation: "no" });
    assert.equal(await db.workScreenshot.count({ where: { sessionId: id } }), 1);
    await assert.rejects(correct(id, { kind: "wrap", endKind: "interrupted", incident: "yes", note: "推流异常中断" }), /上传截图/);
    await upload(id, { kind: "wrap", endKind: "interrupted", incident: "yes", note: "推流异常中断" });
    assert.equal((await get(id)).outcome, "INTERRUPTED");
    await upload(id, { kind: "evidence" });
    assert.equal(await db.workScreenshot.count({ where: { sessionId: id } }), 3);
    const diskBefore = (await readdir(directory)).sort();
    await assert.rejects(upload(id, { kind: "evidence" }, stranger.token), /无执行权限/);
    await assert.rejects(upload(id, { kind: "evidence", version: "1" }), /记录已更新/);
    assert.deepEqual((await readdir(directory)).sort(), diskBefore);
    const beforeRollback = await get(id), eventCount = await db.workEvent.count({ where: { sessionId: id } });
    await assert.rejects(db.$transaction(async tx => { await runWorkCommand(tx, control.token, { id, version: beforeRollback.version, command: "correct", kind: "violation", violation: "no", reason: "回滚验证" }, "test"); throw new Error("forced rollback"); }), /forced rollback/);
    assert.equal((await get(id)).version, beforeRollback.version); assert.equal(await db.workEvent.count({ where: { sessionId: id } }), eventCount);
    const report = await db.$transaction(tx => readWorkSession(tx, boss.token, id));
    assert(report!.corrections.length >= 8); assert(report!.corrections.every(row => (row.detail as { reason: string }).reason));
    assert.equal(await db.$transaction(tx => readWorkSession(tx, stranger.token, id)), null);
    const originalTask = report!.corrections.find(row => (row.detail as { kind: string; before: Record<string, unknown> }).kind === "task" && JSON.stringify(row.detail).includes(completedAt)); assert(originalTask);
    const sourceB = await db.accountRecord.findFirstOrThrow({ where: { accountId: accountB, endedAt: null } });
    const otherSession = await db.workSession.create({ data: { accountId: accountB, sourceRecordId: sourceB.id, controllerId: other.id, loginUserId: other.id, actualControllerId: other.id, actualControllerName: other.name, label: "并发更正测试", phase: "COMPLETE", workflow, workflowVersion: 1, startedAt: ago(60), endedAt: ago(50) } });
    await assert.rejects(correct(id, { kind: "controller", actualControllerId: other.id }), /重叠/);
    await correct(id, { kind: "controller", actualControllerId: control.id });
    const races = await Promise.allSettled([correct(id, { kind: "controller", actualControllerId: helper.id }), correct(otherSession.id, { kind: "controller", actualControllerId: helper.id }, other.token)]);
    assert.equal(races.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(races.filter(r => r.status === "rejected").length, 1);
    const noStart = await work(control.token, { id: account, version: 0, command: "create" });
    await work(control.token, { id: noStart, version: 1, command: "cancel", note: "原记为主动取消" });
    await assert.rejects(correct(noStart, { kind: "times", startedAt: time(5), endedAt: time(2) }), /未开播/);
    await assert.rejects(correct(noStart, { kind: "task", phase: "after", index: 0, status: "done" }), /不属于/);
    await assert.rejects(correct(noStart, { kind: "unstarted", failureReason: "设备故障", note: "实际设备故障" }), /上传截图/);
    await upload(noStart, { kind: "unstarted", failureReason: "设备故障", note: "实际设备故障" });
    assert.equal((await get(noStart)).outcome, "UNSTARTED");
    await assert.rejects(upload(noStart, { kind: "unstarted", failureReason: "设备故障", note: "设备问题", recoveryDate: "2026-02-31" }), /日期无效/);
    const correctShift = async (data: object, token = control.token) => shift(token, { command: "shiftCorrectTime", id: sid, version: (await db.workShift.findUniqueOrThrow({ where: { id: sid } })).version, reason: "核对到岗时间", ...data });
    await assert.rejects(correctShift({ startedAt: time(119), reason: "" }), /更正原因/);
    await assert.rejects(correctShift({ startedAt: time(59) }), /不能晚于/);
    await assert.rejects(correctShift({ startedAt: time(121) }, stranger.token), /不存在/);
    await correctShift({ startedAt: time(125) });
    await assert.rejects(correctShift({ startedAt: time(126), endedAt: time(1) }), /正常流程/);
    await shift(control.token, { command: "shiftEnd", id: sid, version: (await db.workShift.findUniqueOrThrow({ where: { id: sid } })).version });
    const endedShift = await db.workShift.findUniqueOrThrow({ where: { id: sid } });
    await correctShift({ startedAt: time(130), endedAt: shanghaiInput(endedShift.endedAt!) });
    assert.equal((await db.workShift.findUniqueOrThrow({ where: { id: sid } })).endedAt!.toISOString(), endedShift.endedAt!.toISOString());
    await assert.rejects(correctShift({ startedAt: time(130), endedAt: time(2) }), /收尾完成/);
    const oldCheck = (endedShift.checks as Record<string, { at: string }>).sound.at;
    await shift(control.token, { command: "shiftCorrectCheck", id: sid, version: (await db.workShift.findUniqueOrThrow({ where: { id: sid } })).version, item: "sound", status: "issue", note: "原检查填错", reason: "核对设备记录" });
    assert.equal(((await db.workShift.findUniqueOrThrow({ where: { id: sid } })).checks as Record<string, { at: string }>).sound.at, oldCheck);
    await db.workShift.create({ data: { userId: control.id, userName: control.name, branchId: branch.id, startedAt: ago(240), endedAt: ago(200) } });
    await assert.rejects(correctShift({ startedAt: time(220), endedAt: shanghaiInput(endedShift.endedAt!) }), /重叠/);
    const history = await db.$transaction(tx => readShiftHistory(tx, boss.token, 1)); assert(history.some(s => s.id === sid && s.changes.some(c => (c.detail as { changes?: unknown }).changes)));
    await db.douyinAccount.update({ where: { id: account }, data: { controllerId: other.id } });
    await assert.rejects(correct(id, { kind: "violation", violation: "no" }), /更正权限/);
    await db.douyinAccount.update({ where: { id: account }, data: { controllerId: control.id } });
    if (process.env.WORKBENCH_HTTP_BASE) {
      const base = new URL(process.env.WORKBENCH_HTTP_BASE); assert.equal(base.hostname, "127.0.0.1");
      for (const [url, expected, name] of [[`/workbench/sessions/${id}`, "更正本场记录", "session"], ["/workbench/shifts", "上班记录更正历史", "shift"]]) {
        const response = await fetch(new URL(url, base), { headers: { cookie: `session=${signSessionToken(control.token)}` } }); assert.equal(response.status, 200);
        const html = await response.text(); assert(html.includes(expected)); assert(html.includes("更正前")); assert(html.includes("更正后"));
        await writeFile(`/tmp/manager-correction-${name}.html`, html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace("<head>", `<head><base href="${base.origin}">`));
      }
      console.log("PASS: 场次和上班更正入口、修改前后历史的 HTTP 渲染");
    }
    console.log("PASS: 到岗补填、场次更正、权限和并发重叠保护、原时间与截图保留、失败回滚、上班边界和历史查询");
  } finally {
    try {
      if (verified) {
        const accounts = await db.douyinAccount.findMany({ where: { douyinId: { startsWith: marker } }, select: { id: true } }); const ids = accounts.map(a => a.id);
        const sessions = await db.workSession.findMany({ where: { accountId: { in: ids } }, select: { id: true } }); const sessionIds = sessions.map(s => s.id);
        await db.workScreenshot.deleteMany({ where: { sessionId: { in: sessionIds } } }); await db.workEvent.deleteMany({ where: { sessionId: { in: sessionIds } } }); await db.workSession.deleteMany({ where: { id: { in: sessionIds } } });
        const users = await db.user.findMany({ where: { username: { startsWith: marker } }, select: { id: true } }); await db.workShift.deleteMany({ where: { userId: { in: users.map(u => u.id) } } });
        await db.accountWorkflow.deleteMany({ where: { accountId: { in: ids } } }); await db.accountRecord.deleteMany({ where: { accountId: { in: ids } } }); await db.douyinAccount.deleteMany({ where: { id: { in: ids } } }); await cleanupRun(db, marker);
      }
    } finally { await db.$disconnect(); await rm(directory, { recursive: true, force: true }); if (oldDirectory === undefined) delete process.env.WORK_SCREENSHOT_DIR; else process.env.WORK_SCREENSHOT_DIR = oldDirectory; }
  }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(error => { console.error(error); process.exitCode = 1; });
