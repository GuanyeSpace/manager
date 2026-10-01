import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, mkdir, copyFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { signSessionToken } from "../lib/auth/session-token";
import { saveAccount } from "../modules/accounts/service";
import { shanghaiInput } from "../modules/live-reports/schema";
import { defaultWorkflow, type Workflow } from "../modules/workbench/schema";
import { runWorkCommand, saveWorkflow } from "../modules/workbench/service";
import { readScreenshot, screenshotBytes, screenshotDirectory, submitWorkCommand } from "../modules/workbench/screenshots";
import { saveSessionScripts } from "../modules/workbench/session-scripts";
import { readShift, runShiftCommand } from "../modules/workbench/shifts";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
function form(data: Record<string, string>, files: { bytes: Buffer; name: string; type?: string }[] = []) {
  const result = new FormData();
  for (const [key, value] of Object.entries(data)) result.set(key, value);
  for (const file of files) result.append("screenshots", new File([Uint8Array.from(file.bytes)], file.name, { type: file.type ?? "image/png" }));
  return result;
}

async function main() {
  const { dbName } = validateTestEnv(), db = resolveTestClient(), marker = newRunId();
  const directory = await mkdtemp(path.join(os.tmpdir(), "manager-work-evidence-"));
  const oldDirectory = process.env.WORK_SCREENSHOT_DIR;
  process.env.WORK_SCREENSHOT_DIR = directory;
  let verified = false;
  const httpCopies: string[] = [];
  try {
    await assertTestDatabase(db, dbName); verified = true;
    assert.equal(screenshotDirectory(), directory);
    const branch = await db.branch.create({ data: { name: `${marker}-branch` } });
    async function user(name: string, role: "BOSS" | "CONTROLLER" | "ANCHOR", branchId: string | null) {
      const created = await db.user.create({ data: { username: `${marker}-${name}`, name, role, branchId, passwordHash: "not-a-real-hash", mustChangePassword: false } });
      const token = `${marker}-${name}`;
      await db.session.create({ data: { id: token, userId: created.id, expiresAt: new Date(Date.now() + 3600000) } });
      return { ...created, token };
    }
    const boss = await user("boss", "BOSS", null);
    const controller = await user("controller", "CONTROLLER", branch.id);
    const outsider = await user("outsider", "CONTROLLER", branch.id);
    const anchor = await user("anchor", "ANCHOR", branch.id);
    const accountId = await db.$transaction(tx => saveAccount(tx, boss.token, {
      id: "", version: 0, douyinId: `${marker}-account`, name: "证据测试账号", homepageUrl: "", realName: "", phone: "", purpose: "", notes: "", branchId: branch.id, controllerId: controller.id, operatorId: "", anchorId: anchor.id, active: "true",
    }, "test"));
    const workflow: Workflow = { ...defaultWorkflow, before: [], live: [], after: [defaultWorkflow.after[0]], materials: "保留素材", scripts: [{ category: "关注话术", title: "原话术", body: "原内容", scene: "开场" }] };
    await db.$transaction(tx => saveWorkflow(tx, boss.token, accountId, 0, workflow, "test"));
    await db.accountWorkflow.update({ where: { accountId }, data: { content: workflow } });
    const work = (token: string, data: object) => db.$transaction(tx => runWorkCommand(tx, token, data, "test"));
    const shift = (token: string, data: object) => db.$transaction(tx => runShiftCommand(tx, token, data, "test"));
    const submit = (token: string, data: Record<string, string>, files: { bytes: Buffer; name: string; type?: string }[] = []) => submitWorkCommand(db, token, form(data, files), "test");
    const screenshot = (token: string, id: string) => db.$transaction(tx => readScreenshot(tx, token, id));
    const startShift = async () => {
      const id = await shift(controller.token, { command: "shiftStart" });
      await db.workShift.update({ where: { id }, data: { startedAt: new Date(Date.now() - 30 * 60000) } });
      for (const [index, item] of (["sound", "picture", "network"] as const).entries()) await shift(controller.token, { command: "shiftCheck", id, version: index + 1, item, status: "normal" });
      return id;
    };
    const shiftOne = await startShift();
    const first = await work(controller.token, { id: accountId, version: 0, command: "create" });
    const unstarted = { id: first, version: "1", command: "unstarted", failureReason: "设备故障", note: "推流设备无法工作" };
    await assert.rejects(submit(controller.token, { ...unstarted, failureReason: "" }, [{ bytes: png, name: "one.png" }]), /未开播类型/);
    await assert.rejects(submit(controller.token, { ...unstarted, note: "" }, [{ bytes: png, name: "one.png" }]), /具体原因/);
    await assert.rejects(submit(controller.token, unstarted), /截图/);
    await assert.rejects(submit(controller.token, unstarted, [{ bytes: Buffer.from("not an image"), name: "fake.png" }]), /PNG/);
    await assert.rejects(submit(controller.token, unstarted, Array.from({ length: 7 }, (_, i) => ({ bytes: png, name: `${i}.png` }))), /最多 6 张/);
    await assert.rejects(submit(controller.token, unstarted, [{ bytes: Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]), name: "large.png" }]), /单张/);
    await assert.rejects(submit(controller.token, unstarted, Array.from({ length: 5 }, (_, i) => ({ bytes: Buffer.concat([png, Buffer.alloc(4 * 1024 * 1024)]), name: `${i}.png` }))), /合计/);
    await assert.rejects(submit(outsider.token, unstarted, [{ bytes: png, name: "stolen.png" }]), /无执行权限/);
    await assert.rejects(submit("missing-session", unstarted, [{ bytes: png, name: "anonymous.png" }]), /登录/);
    assert.equal((await readdir(directory)).length, 0);
    assert.equal((await db.workSession.findUniqueOrThrow({ where: { id: first } })).version, 1);
    assert.equal(await db.workScreenshot.count({ where: { sessionId: first } }), 0);
    await assert.rejects(db.$transaction(async tx => {
      await runWorkCommand(tx, controller.token, { ...unstarted, version: 1 }, "test", [{ id: randomUUID(), contentType: "image/png", size: png.length }]);
      throw new Error("forced rollback");
    }), /forced rollback/);
    assert.equal((await db.workSession.findUniqueOrThrow({ where: { id: first } })).version, 1);
    assert.equal(await db.workScreenshot.count({ where: { sessionId: first } }), 0);
    assert.equal(await db.workEvent.count({ where: { sessionId: first } }), 0);

    await submit(controller.token, unstarted, [{ bytes: png, name: "one.png", type: "text/plain" }, { bytes: png, name: "two.png" }]);
    const archived = await db.workSession.findUniqueOrThrow({ where: { id: first }, include: { events: true, screenshots: true } });
    assert.equal(archived.phase, "CANCELLED");
    assert.equal(archived.outcome, "UNSTARTED");
    assert.equal(archived.screenshots.length, 2);
    assert(archived.events.some(event => event.kind === "unstarted" && /设备故障/.test(event.body)));
    for (const shot of archived.screenshots) {
      assert.equal(shot.contentType, "image/png");
      assert.equal(shot.size, png.length);
      assert.equal(shot.sessionId, first);
      assert.equal((await screenshot(controller.token, shot.id))?.id, shot.id);
      assert.equal(await screenshot(outsider.token, shot.id), null);
      assert.equal(await screenshot("missing-session", shot.id).then(() => "allowed", () => "denied"), "denied");
      assert.deepEqual(await screenshotBytes(shot.id), png);
      assert.deepEqual(await readFile(path.join(directory, shot.id)), png);
    }
    if (process.env.WORKBENCH_HTTP_BASE && process.env.WORKBENCH_HTTP_SCREENSHOT_DIR) {
      const base = new URL(process.env.WORKBENCH_HTTP_BASE);
      assert.equal(base.hostname, "127.0.0.1");
      const destination = process.env.WORKBENCH_HTTP_SCREENSHOT_DIR;
      assert(destination.startsWith(os.tmpdir() + path.sep) || destination.startsWith("/tmp/"));
      await mkdir(destination, { recursive: true });
      for (const shot of archived.screenshots) {
        const target = path.join(destination, shot.id); httpCopies.push(target);
        await copyFile(path.join(directory, shot.id), target);
        const url = new URL(`/workbench/screenshots/${shot.id}`, base);
        const response = await fetch(url, { headers: { cookie: `session=${signSessionToken(controller.token)}` } });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-type"), "image/png");
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
        assert.equal((await fetch(url, { headers: { cookie: `session=${signSessionToken(outsider.token)}` }, redirect: "manual" })).status, 404);
        const anonymous = await fetch(url, { redirect: "manual" });
        assert([307, 401].includes(anonymous.status));
      }
      const response = await fetch(new URL(`/workbench/sessions/${first}`, base), { headers: { cookie: `session=${signSessionToken(controller.token)}` } });
      assert.equal(response.status, 200);
      const html = await response.text(); assert(html.includes("本场全部截图")); assert(html.includes("未正常开播"));
      await writeFile("/tmp/manager-evidence-preview.html", html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace("<head>", `<head><base href="${base.origin}">`));
      console.log("PASS: 截图 HTTP 原始字节、私有响应头、越权 404、匿名拒绝及归档截图入口");
    }
    assert.equal((await db.$transaction(tx => readShift(tx, controller.token))).unfinished, 0);
    await shift(controller.token, { command: "shiftCheck", id: shiftOne, version: 4, item: "computer", status: "normal" });
    await shift(controller.token, { command: "shiftEarlyEnd", id: shiftOne, version: 5, reason: "测试提前结束" });
    assert((await db.workSession.findUniqueOrThrow({ where: { id: first } })).phase === "CANCELLED");

    const shiftTwo = await startShift();
    const second = await work(controller.token, { id: accountId, version: 0, command: "create" });
    const accountBefore = await db.accountWorkflow.findUniqueOrThrow({ where: { accountId } });
    const sessionBefore = await db.workSession.findUniqueOrThrow({ where: { id: second } });
    const scripts = [{ category: "关注话术" as const, title: "新话术", body: "新内容", scene: "直播" }];
    const saveScripts = (token: string, sv: number, av: number) => db.$transaction(tx => saveSessionScripts(tx, token, second, sv, av, scripts, "test"));
    await assert.rejects(saveScripts(outsider.token, sessionBefore.version, accountBefore.version), /无执行权限/);
    await assert.rejects(saveScripts(controller.token, sessionBefore.version, accountBefore.version + 1), /已被其他人/);
    await saveScripts(controller.token, sessionBefore.version, accountBefore.version);
    const accountAfter = await db.accountWorkflow.findUniqueOrThrow({ where: { accountId } });
    const sessionAfter = await db.workSession.findUniqueOrThrow({ where: { id: second } });
    assert.equal(accountAfter.version, accountBefore.version + 1);
    assert.equal(sessionAfter.version, sessionBefore.version + 1);
    assert.equal(sessionAfter.workflowVersion, sessionBefore.workflowVersion);
    assert.deepEqual((accountAfter.content as Workflow).scripts, scripts);
    assert.deepEqual((sessionAfter.workflow as Workflow).scripts, scripts);
    assert.deepEqual((accountAfter.content as Workflow).before, workflow.before);
    assert.equal((accountAfter.content as Workflow).materials, workflow.materials);
    assert.deepEqual((archived.workflow as Workflow).scripts, workflow.scripts);
    assert.deepEqual(((await db.workSession.findUniqueOrThrow({ where: { id: first } })).workflow as Workflow).scripts, workflow.scripts);
    const scriptAudit = await db.auditLog.findFirstOrThrow({ where: { targetType: "AccountWorkflow", targetId: accountId }, orderBy: { createdAt: "desc" } });
    assert.deepEqual((scriptAudit.detail as { before: Workflow }).before.scripts, workflow.scripts);
    assert.deepEqual((scriptAudit.detail as { after: Workflow }).after.scripts, scripts);
    await assert.rejects(saveScripts(controller.token, sessionBefore.version, accountBefore.version), /已被其他人/);

    await db.workSession.update({ where: { id: second }, data: { createdAt: new Date(Date.now() - 20 * 60000) } });
    await work(controller.token, { id: second, version: sessionAfter.version, command: "start", time: shanghaiInput(new Date(Date.now() - 10 * 60000)) });
    let live = await db.workSession.findUniqueOrThrow({ where: { id: second } });
    await assert.rejects(submit(controller.token, { id: second, version: String(live.version), command: "violation", violation: "yes", note: "违规提示" }), /截图/);
    await assert.rejects(submit(controller.token, { id: second, version: String(live.version), command: "violation", violation: "yes", note: "" }, [{ bytes: png, name: "v.png" }]), /违规内容/);
    await submit(controller.token, { id: second, version: String(live.version), command: "violation", violation: "yes", note: "平台违规提示" }, [{ bytes: png, name: "v.png" }]);
    live = await db.workSession.findUniqueOrThrow({ where: { id: second } });
    assert.equal(live.hasViolation, true);
    const storedBeforeFailure = (await readdir(directory)).sort();
    await assert.rejects(submit(controller.token, { id: second, version: String(live.version - 1), command: "violation", violation: "yes", note: "过期提交" }, [{ bytes: png, name: "stale.png" }]), /已更新/);
    assert.deepEqual((await readdir(directory)).sort(), storedBeforeFailure);
    assert.equal(await db.workScreenshot.count({ where: { sessionId: second } }), 1);

    await assert.rejects(submit(controller.token, { id: second, version: String(live.version), command: "end", endKind: "interrupted", time: shanghaiInput(new Date(Date.now() - 5 * 60000)), note: "推流中断" }), /截图/);
    await assert.rejects(submit(controller.token, { id: second, version: String(live.version), command: "end", endKind: "interrupted", time: shanghaiInput(new Date(Date.now() - 5 * 60000)), note: "" }, [{ bytes: png, name: "end.png" }]), /原因/);
    await submit(controller.token, { id: second, version: String(live.version), command: "end", endKind: "interrupted", time: shanghaiInput(new Date(Date.now() - 5 * 60000)), note: "推流中断" }, [{ bytes: png, name: "end.png" }]);
    let wrap = await db.workSession.findUniqueOrThrow({ where: { id: second } });
    assert.equal(wrap.phase, "WRAP");
    assert.equal(wrap.outcome, "INTERRUPTED");
    await assert.rejects(submit(controller.token, { id: second, version: String(wrap.version), command: "violation", violation: "no" }, [{ bytes: png, name: "unneeded.png" }]), /不需要上传截图/);
    await work(controller.token, { id: second, version: wrap.version, command: "violation", violation: "no" });
    wrap = await db.workSession.findUniqueOrThrow({ where: { id: second } });
    assert.equal(wrap.hasViolation, false);
    await assert.rejects(submit(controller.token, { id: second, version: String(wrap.version), command: "violation", violation: "yes", note: "复查发现违规" }), /截图/);
    await submit(controller.token, { id: second, version: String(wrap.version), command: "violation", violation: "yes", note: "复查发现违规" }, [{ bytes: png, name: "wrap.png" }]);
    wrap = await db.workSession.findUniqueOrThrow({ where: { id: second } });
    assert.equal(wrap.hasViolation, true);
    await assert.rejects(work(controller.token, { id: second, version: wrap.version, command: "complete", incident: "no" }), /下播后事项/);
    await work(controller.token, { id: second, version: wrap.version, command: "check", phase: "after", index: 0, status: "done" });
    wrap = await db.workSession.findUniqueOrThrow({ where: { id: second } });
    await assert.rejects(work(controller.token, { id: second, version: wrap.version, command: "complete" }), /异常或无异常/);
    await assert.rejects(work(controller.token, { id: second, version: wrap.version, command: "complete", incident: "yes", violation: "yes", otherIncident: "yes" }), /原因/);
    await work(controller.token, { id: second, version: wrap.version, command: "complete", incident: "yes", violation: "yes", otherIncident: "yes", note: "已通知值班人员恢复推流" });
    const completed = await db.workSession.findUniqueOrThrow({ where: { id: second }, include: { screenshots: true, events: true } });
    assert.equal(completed.phase, "COMPLETE");
    assert.equal(completed.hasIncident, true);
    assert.equal(completed.screenshots.length, 3);
    assert(completed.events.some(event => event.kind === "end" && /异常中断/.test(event.body)));
    assert.equal((await screenshot(controller.token, completed.screenshots[0].id))?.id, completed.screenshots[0].id);
    assert.deepEqual(await screenshotBytes(archived.screenshots[0].id), png);
    const third = await work(controller.token, { id: accountId, version: 0, command: "create" });
    await db.workSession.update({ where: { id: third }, data: { createdAt: new Date(Date.now() - 4 * 60000) } });
    await work(controller.token, { id: third, version: 1, command: "start", time: shanghaiInput(new Date(Date.now() - 3 * 60000)) });
    await work(controller.token, { id: third, version: 2, command: "end", time: shanghaiInput(new Date(Date.now() - 2 * 60000)) });
    await work(controller.token, { id: third, version: 3, command: "check", phase: "after", index: 0, status: "done" });
    const finish = { id: third, version: "4", command: "complete", incident: "yes", violation: "yes", otherIncident: "yes", note: "violation and other incident" };
    await assert.rejects(submit(controller.token, { ...finish, violation: "no", otherIncident: "no" }), /异常类型/);
    await assert.rejects(submit(controller.token, finish), /截图/);
    await assert.rejects(submit(controller.token, { ...finish, incident: "no" }), /无异常/);
    await assert.rejects(submit(outsider.token, finish, [{ bytes: png, name: "foreign.png" }]), /权限/);
    await assert.rejects(submit("expired", finish, [{ bytes: png, name: "expired.png" }]), /登录/);
    await assert.rejects(db.$transaction(async tx => {
      await runWorkCommand(tx, controller.token, finish, "test", [{ id: randomUUID(), contentType: "image/png", size: png.length }]);
      throw Error("rollback-complete");
    }), /rollback-complete/);
    assert.equal((await db.workSession.findUniqueOrThrow({ where: { id: third } })).phase, "WRAP");
    assert.equal(await db.workScreenshot.count({ where: { sessionId: third } }), 0);
    await submit(controller.token, finish, [{ bytes: png, name: "finish.png" }]);
    const both = await db.workSession.findUniqueOrThrow({ where: { id: third } });
    assert.equal(both.phase, "COMPLETE"); assert.equal(both.hasIncident, true);
    assert.equal(both.hasViolation, true); assert.equal(both.hasOtherIncident, true);
    assert.equal(await db.workScreenshot.count({ where: { sessionId: third, event: { kind: "complete" } } }), 1);
    const fourth = await work(controller.token, { id: accountId, version: 0, command: "create" });
    await work(controller.token, { id: fourth, version: 1, command: "start", time: shanghaiInput(new Date()) });
    // Isolated fixture: supply a completed broadcast interval without waiting a minute.
    await db.workSession.update({ where: { id: fourth }, data: { startedAt: new Date(Date.now() - 60000) } });
    await work(controller.token, { id: fourth, version: 2, command: "end", time: shanghaiInput(new Date()) });
    await work(controller.token, { id: fourth, version: 3, command: "check", phase: "after", index: 0, status: "done" });
    await work(controller.token, { id: fourth, version: 4, command: "complete", incident: "no" });
    assert.equal((await db.workSession.findUniqueOrThrow({ where: { id: fourth } })).hasIncident, false);
    await shift(controller.token, { command: "shiftCheck", id: shiftTwo, version: 4, item: "computer", status: "normal" });
    await shift(controller.token, { command: "shiftEarlyEnd", id: shiftTwo, version: 5, reason: "测试提前结束" });
    console.log("PASS: 截图校验、私有文件与授权读取、失败清理、未开播和异常中断、话术同步及历史隔离");
  } finally {
    try {
      if (verified) {
        const accounts = await db.douyinAccount.findMany({ where: { douyinId: { startsWith: marker } }, select: { id: true } });
        const accountIds = accounts.map(account => account.id);
        const sessions = await db.workSession.findMany({ where: { accountId: { in: accountIds } }, select: { id: true } });
        const sessionIds = sessions.map(session => session.id);
        await db.workScreenshot.deleteMany({ where: { sessionId: { in: sessionIds } } });
        await db.workEvent.deleteMany({ where: { sessionId: { in: sessionIds } } });
        await db.workSession.deleteMany({ where: { id: { in: sessionIds } } });
        await db.workShift.deleteMany({ where: { userId: { in: (await db.user.findMany({ where: { username: { startsWith: marker } }, select: { id: true } })).map(user => user.id) } } });
        await db.accountWorkflow.deleteMany({ where: { accountId: { in: accountIds } } });
        await db.accountRecord.deleteMany({ where: { accountId: { in: accountIds } } });
        await db.douyinAccount.deleteMany({ where: { id: { in: accountIds } } });
        await cleanupRun(db, marker);
      }
    } finally {
      for (const file of httpCopies) await rm(file, { force: true });
      await db.$disconnect();
      await rm(directory, { recursive: true, force: true });
      if (oldDirectory === undefined) delete process.env.WORK_SCREENSHOT_DIR;
      else process.env.WORK_SCREENSHOT_DIR = oldDirectory;
    }
  }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(error => { console.error(error); process.exitCode = 1; });
