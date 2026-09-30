import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Screenshot } from "../modules/workbench/screenshots";
import { writeFileSync } from "node:fs";
import { signSessionToken } from "../lib/auth/session-token";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
import { saveAccount, setBranchManager } from "../modules/accounts/service";
import { copyWorkflow, runWorkCommand, saveWorkflow, readWorkbench, readWorkspace, readWorkSession, saveDailyWork } from "../modules/workbench/service";
import { workflowSchema, moveTask, taskSeconds, taskTimeLabel, defaultWorkflow, moneyPending, type Progress, type Workflow } from "../modules/workbench/schema";
import { saveLiveReport } from "../modules/live-reports/service";
import { runShiftCommand } from "../modules/workbench/shifts";
import { shanghaiInput } from "../modules/live-reports/schema";

async function main() {
  const { dbName } = validateTestEnv(), db = resolveTestClient(), marker = newRunId(); let verified = false;
  try {
    await assertTestDatabase(db, dbName); verified = true;
    const branch = await db.branch.create({ data: { name: `${marker}-a` } });
    const otherBranch = await db.branch.create({ data: { name: `${marker}-b` } });
    async function user(name: string, role: "BOSS" | "CONTROLLER" | "OPERATOR", branchId: string | null) {
      const u = await db.user.create({ data: { username: `${marker}-${name}`, name, role, branchId, passwordHash: "not-a-real-hash", mustChangePassword: false } });
      const token = `${marker}-${name}`; await db.session.create({ data: { id: token, userId: u.id, expiresAt: new Date(Date.now() + 3600000) } }); return { ...u, token };
    }
    const boss = await user("boss", "BOSS", null), control = await user("control", "CONTROLLER", branch.id), operator = await user("operator", "OPERATOR", branch.id), outsider = await user("outsider", "OPERATOR", branch.id), next = await user("next", "CONTROLLER", otherBranch.id);
    const manager = await user("manager", "OPERATOR", branch.id);
    await db.$transaction(tx => setBranchManager(tx, boss.token, { branchId: branch.id, managerId: manager.id, previousManagerId: "" }, "test"));
    const a = { id: "", version: 0, douyinId: `${marker}-a`, name: "账号 A", homepageUrl: "", realName: "", phone: "", purpose: "", notes: "", branchId: branch.id, controllerId: control.id, operatorId: operator.id, anchorId: boss.id, active: "true" as const };
    const accountId = await db.$transaction(tx => saveAccount(tx, boss.token, a, "test"));
    const secondId = await db.$transaction(tx => saveAccount(tx, boss.token, { ...a, douyinId: `${marker}-b`, name: "账号 B" }, "test"));
    const workflow = { ...defaultWorkflow, scripts: [{ category: "关注话术" as const, title: "账号 A 关注", body: "账号 A 专属内容", scene: "开场" }] };
    const save = (token: string, id: string, version: number, content = workflow) => db.$transaction(tx => saveWorkflow(tx, token, id, version, content, "test"));
    const cmd = (token: string, data: object, screenshots: Screenshot[] = []) => db.$transaction(tx => runWorkCommand(tx, token, data, "test", screenshots));
    const read = (token: string, id: string) => db.$transaction(tx => readWorkSession(tx, token, id), { isolationLevel: "RepeatableRead" });
    const home = (token: string) => db.$transaction(tx => readWorkbench(tx, token), { isolationLevel: "RepeatableRead" });
    await assert.rejects(save(outsider.token, accountId, 0), /无权/);
    await assert.rejects(save(next.token, accountId, 0), /无权/);
    await save(operator.token, accountId, 0);
    await assert.rejects(save(control.token, accountId, 1), /无权/);
    const scriptsSave = (token: string, version: number, scripts = workflow.scripts) => db.$transaction(tx => saveWorkflow(tx, token, accountId, version, scripts, "test", true));
    await assert.rejects(scriptsSave(outsider.token, 1), /无权/);
    await scriptsSave(control.token, 1);
    await save(manager.token, accountId, 2);
    await assert.rejects(scriptsSave(control.token, 2), /已被/);
    await save(boss.token, secondId, 0, { ...workflow, scripts: [{ ...workflow.scripts[0], body: "账号 B 专属内容" }] });
    await assert.rejects(cmd(operator.token, { id: accountId, version: 0, command: "create", label: "晚上场" }), /仅负责/);
    const shiftId = await db.$transaction(tx => runShiftCommand(tx, control.token, { command: "shiftStart" }, "test"));
    for (const [i, item] of ["sound", "picture", "network"].entries()) await db.$transaction(tx => runShiftCommand(tx, control.token, { command: "shiftCheck", id: shiftId, version: i + 1, item, status: "normal" }, "test"));
    const first = await cmd(control.token, { id: accountId, version: 0, command: "create", label: "晚上场" });
    const second = await cmd(control.token, { id: secondId, version: 0, command: "create", label: "晚上场" });
    await assert.rejects(cmd(control.token, { id: accountId, version: 0, command: "create", label: "重复场" }), /已有/);
    await scriptsSave(control.token, 3, [{ ...workflow.scripts[0], body: "新版本内容" }]);
    assert.deepEqual(((await db.accountWorkflow.findUniqueOrThrow({ where: { accountId } })).content as Workflow).before, workflow.before);
    assert.equal(((await read(control.token, first))!.session.workflow as Workflow).scripts[0].body, "账号 A 专属内容");
    assert.equal(((await read(control.token, second))!.session.workflow as Workflow).scripts[0].body, "账号 B 专属内容");
    const copy = (token: string, targets: { id: string; version: number }[], parts = ["before", "live", "after", "scripts", "materials"], sourceVersion = 4) => db.$transaction(tx => copyWorkflow(tx, token, { sourceId: accountId, sourceVersion, targets, parts }, "test"));
    await assert.rejects(copy(control.token, [{ id: secondId, version: 1 }]), /无配置权限/);
    await assert.rejects(copy(outsider.token, [{ id: secondId, version: 1 }]), /无配置权限/);
    await assert.rejects(copy(boss.token, [{ id: secondId, version: 1 }], ["scripts"], 3), /来源配置已变化/);
    const thirdId = await db.$transaction(tx => saveAccount(tx, boss.token, { ...a, douyinId: `${marker}-copy-target`, branchId: otherBranch.id, operatorId: "", controllerId: next.id }, "test"));
    await assert.rejects(copy(operator.token, [{ id: thirdId, version: 0 }]), /无配置权限/);
    await assert.rejects(copy(boss.token, [{ id: thirdId, version: 0 }], ["scripts"]), /三个阶段/);
    await assert.rejects(copy(boss.token, [{ id: secondId, version: 1 }, { id: thirdId, version: 1 }]), /目标配置已变化/);
    assert.equal((await db.accountWorkflow.findUniqueOrThrow({ where: { accountId: secondId } })).version, 1);
    await copy(operator.token, [{ id: secondId, version: 1 }], ["before"]);
    assert.equal(((await db.accountWorkflow.findUniqueOrThrow({ where: { accountId: secondId } })).content as Workflow).scripts[0].body, "账号 B 专属内容");
    await copy(boss.token, [{ id: secondId, version: 2 }, { id: thirdId, version: 0 }]);
    assert.equal(((await db.accountWorkflow.findUniqueOrThrow({ where: { accountId: thirdId } })).content as Workflow).scripts[0].body, "新版本内容");
    assert.equal(((await read(control.token, second))!.session.workflow as Workflow).scripts[0].body, "账号 B 专属内容");
    await save(boss.token, thirdId, 1, { ...workflow, materials: "单独调整" });
    assert.notEqual(((await db.accountWorkflow.findUniqueOrThrow({ where: { accountId: secondId } })).content as Workflow).materials, "单独调整");

    assert.equal(taskSeconds({ minute: 3 }), 180);
    assert.equal(taskSeconds({ minute: 1, second: 30 }), 90);
    assert.equal(taskTimeLabel({ minute: 1, second: 30 }), "1 分 30 秒");
    assert.equal(workflowSchema.safeParse({ ...workflow, live: [{ ...workflow.live[0], second: 60 }] }).success, false);
    assert.equal(workflowSchema.safeParse({ ...workflow, live: [{ ...workflow.live[0], second: -1 }] }).success, false);
    await db.$transaction(tx => runShiftCommand(tx, next.token, { command: "shiftStart" }, "test"));
    const oldThird = await cmd(next.token, { id: thirdId, version: 0, command: "create", label: "旧分钟场次" });
    const secondWorkflow = { ...workflow, before: moveTask(workflow.before, 0, 2), live: [{ ...workflow.live[1], minute: 1, second: 45 }, { ...workflow.live[0], minute: 1, second: 15 }] };
    assert.equal(workflow.before[0].title, defaultWorkflow.before[0].title);
    await save(boss.token, thirdId, 2, secondWorkflow);
    const savedSeconds = (await db.accountWorkflow.findUniqueOrThrow({ where: { accountId: thirdId } })).content as Workflow;
    assert.deepEqual(savedSeconds.before, secondWorkflow.before); assert.deepEqual(savedSeconds.live, secondWorkflow.live);
    assert.deepEqual(((await read(next.token, oldThird))!.session.workflow as Workflow).before, workflow.before);
    assert.equal(((await read(next.token, oldThird))!.session.workflow as Workflow).live[0].second, undefined);
    await cmd(next.token, { id: oldThird, version: 1, command: "cancel", note: "结束本轮旧分钟测试" });
    const secondSession = await cmd(next.token, { id: thirdId, version: 0, command: "create", label: "秒级流程" });
    assert.deepEqual(((await read(next.token, secondSession))!.session.workflow as Workflow).live, secondWorkflow.live);
    assert.equal([...secondWorkflow.live].sort((a, b) => taskSeconds(a) - taskSeconds(b))[0].second, 15);
    await db.$transaction(tx => copyWorkflow(tx, boss.token, { sourceId: thirdId, sourceVersion: 3, targets: [{ id: secondId, version: 3 }], parts: ["live"] }, "test"));
    assert.deepEqual(((await db.accountWorkflow.findUniqueOrThrow({ where: { accountId: secondId } })).content as Workflow).live, secondWorkflow.live);
    assert.equal(((await read(control.token, second))!.session.workflow as Workflow).live[0].second, undefined);
    console.log("PASS: 拖动顺序整项保留、秒级校验与提醒排序、旧分钟兼容、场次快照不变、复制秒数保留");

    await assert.rejects(db.$transaction(tx => saveAccount(tx, boss.token, { ...a, id: accountId, version: 1, controllerId: boss.id }, "test")), /正在准备/);
    await cmd(control.token, { id: first, version: 1, command: "check", phase: "before", index: 0, status: "done" });
    assert.equal(((await read(control.token, first))!.session.progress as Progress)["before:0"].status, "done");
    await assert.rejects(cmd(control.token, { id: first, version: 1, command: "check" }), /已更新/);
    await assert.rejects(cmd(control.token, { id: first, version: 2, command: "check", status: "skip" }), /需要填写/);
    await assert.rejects(cmd(outsider.token, { id: first, version: 2, command: "issue", note: "越权" }), /权限/);
    assert.equal(await read(outsider.token, first), null);
    assert.equal(await db.$transaction(tx => readWorkspace(tx, next.token, accountId)), null);
    // 仅回调本轮测试场次的创建时间，模拟已准备 20 分钟。
    const past = new Date(Date.now() - 20 * 60000);
    await db.workSession.updateMany({ where: { id: { in: [first, second] } }, data: { createdAt: past } });
    await db.workShift.update({ where: { id: shiftId }, data: { startedAt: past } });
    const time = shanghaiInput(new Date(Date.now() - 10 * 60000));
    await assert.rejects(cmd(control.token, { id: first, version: 2, command: "start", time }), /准备事项/);
    await db.branch.update({ where: { id: branch.id }, data: { status: "INACTIVE" } });
    await assert.rejects(cmd(control.token, { id: first, version: 2, command: "start", time, note: "已核对" }), /停用/);
    await db.branch.update({ where: { id: branch.id }, data: { status: "ACTIVE" } });
    const races = await Promise.allSettled([cmd(control.token, { id: first, version: 2, command: "start", time, note: "准备余项已人工核对" }), cmd(control.token, { id: second, version: 1, command: "start", time, note: "已核对" })]);
    assert.equal(races.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(await db.workSession.count({ where: { controllerId: control.id, phase: "LIVE" } }), 1);
    const live = await db.workSession.findFirstOrThrow({ where: { controllerId: control.id, phase: "LIVE" } });
    const waiting = live.id === first ? second : first;
    await assert.rejects(db.workSession.update({ where: { id: waiting }, data: { phase: "LIVE" } }), (e: unknown) => (e as { code: string }).code === "P2002");
    await cmd(control.token, { id: live.id, version: live.version, command: "patrol", note: "第一轮：正常" });
    await cmd(control.token, { id: live.id, version: live.version + 1, command: "patrol", note: "第二轮：正常" });
    assert.equal((await read(control.token, live.id))!.session.events.filter(e => e.kind === "patrol").length, 2);
    const end = shanghaiInput(new Date(Date.now() - 5 * 60000));
    await assert.rejects(cmd(control.token, { id: live.id, version: live.version + 2, command: "end", time }), /晚于开播/);
    await assert.rejects(cmd(control.token, { id: live.id, version: live.version + 2, command: "end", time: end }), /未完成原因/);
    await cmd(control.token, { id: live.id, version: live.version + 2, command: "end", time: end, note: "临时提前结束，未到后续环节" });
    const waitingSession = await db.workSession.findUniqueOrThrow({ where: { id: waiting } });
    await assert.rejects(cmd(control.token, { id: waiting, version: waitingSession.version, command: "start", time, note: "重叠" }), /重叠/);
    await cmd(control.token, { id: waiting, version: waitingSession.version, command: "start", time: end, note: "上一场已结束" });
    // 收尾与数据填写独立：上一场数据为空，仍能开下一场。
    assert.equal((await home(control.token)).sessions.some(s => s.id === live.id && !s.report), true);
    const wrapWorkspace = await db.$transaction(tx => readWorkspace(tx, control.token, live.accountId));
    assert.equal(wrapWorkspace!.wrapping.some(s => s.id === live.id), true);
    if (process.env.WORKBENCH_HTTP_BASE) {
      const response = await fetch(new URL(`/workbench/accounts/${live.accountId}`, process.env.WORKBENCH_HTTP_BASE), { headers: { cookie: `session=${signSessionToken(control.token)}` } });
      assert.match(await response.text(), /继续收尾/);
      const page = await fetch(new URL(`/workbench/sessions/${live.id}`, process.env.WORKBENCH_HTTP_BASE), { headers: { cookie: `session=${signSessionToken(control.token)}` } });
      const html = await page.text();
      for (const label of ["标记异常", "不适用", "还需处理", "请先保存本场是否违规", "直播中未处理事项"]) assert.ok(html.includes(label));
    }
    let v = live.version + 3;
    await assert.rejects(cmd(control.token, { id: live.id, version: v, command: "complete", incident: "no" }), /收尾事项/);
    for (let index = 0; index < workflow.after.length; index++) await cmd(control.token, { id: live.id, version: v++, command: "check", phase: "after", index, status: "done" });
    await assert.rejects(cmd(control.token, { id: live.id, version: v, command: "complete", incident: "no" }), /是否违规/);
    await assert.rejects(cmd(control.token, { id: live.id, version: v, command: "violation", violation: "yes" }), /截图/);
    await cmd(control.token, { id: live.id, version: v++, command: "violation", violation: "yes", note: "测试违规记录" }, [{ id: randomUUID(), contentType: "image/png", size: 68 }]);
    assert.equal((await read(control.token, live.id))!.session.violationDetail, "测试违规记录");
    await cmd(control.token, { id: live.id, version: v++, command: "violation", violation: "no" });
    assert.equal((await read(control.token, live.id))!.session.violationDetail, "");
    const beforeNote = (await read(control.token, live.id))!.session.progress as Progress;
    await cmd(control.token, { id: live.id, version: v++, command: "check", phase: "after", index: 0, status: "done", note: "补充备注" });
    assert.equal(((await read(control.token, live.id))!.session.progress as Progress)["after:0"].at, beforeNote["after:0"].at);
    await cmd(control.token, { id: live.id, version: v++, command: "check", phase: "after", index: 0, status: "pending", note: "暂未完成" });
    await assert.rejects(cmd(control.token, { id: live.id, version: v, command: "complete", incident: "no" }), /收尾事项/);
    await cmd(control.token, { id: live.id, version: v++, command: "check", phase: "after", index: 0, status: "done" });
    await assert.rejects(cmd(control.token, { id: live.id, version: v, command: "check", phase: "after", index: 0, status: "issue", note: " " }), /需要填写/);
    await cmd(control.token, { id: live.id, version: v++, command: "check", phase: "after", index: 0, status: "issue", note: "设备故障，已登记待维修" });
    await cmd(control.token, { id: live.id, version: v++, command: "check", phase: "after", index: 1, status: "skip", note: "本场未使用该设备" });
    const handled = (await read(control.token, live.id))!.session.progress as Progress;
    assert.equal(handled["after:0"].status, "issue");
    assert.equal(handled["after:1"].status, "skip");
    await cmd(control.token, { id: live.id, version: v, command: "complete", incident: "no" });
    assert.equal((await db.$transaction(tx => readWorkspace(tx, control.token, live.accountId)))!.wrapping.length, 0);
    const reportInput = { id: "", version: "0", accountId: live.accountId, workSessionId: live.id, startedAt: time, durationHours: "0", durationMinutes: "5", durationSeconds: "0", sessionLabel: "晚上场", exposureCount: "100", entryCount: "10", averageOnline: "5", peakOnline: "10", averageStayMinutes: "2.9", commenterCount: "2", likeCount: "8", newFollowers: "1", shareCount: "1", newFanClubMembers: "1", confirmBackfill: "false" };
    await assert.rejects(db.$transaction(tx => saveLiveReport(tx, boss.token, { ...reportInput, workSessionId: waiting }, "test")), /不符/);
    if (process.env.WORKBENCH_HTTP_BASE) {
      const base = new URL(process.env.WORKBENCH_HTTP_BASE);
      assert.equal(base.hostname, "127.0.0.1");
      for (const path of ["/boss", "/account-config", `/account-config/${accountId}`, "/resources/rooms", "/boss/users", "/boss/branches"]) {
        const response = await fetch(new URL(path, base), { headers: { cookie: `session=${signSessionToken(boss.token)}` }, redirect: "manual" });
        assert.equal(response.status, 200, path);
        const html = await response.text(); assert(html.includes("管理菜单"), path);
        if (path === "/account-config") writeFileSync("/tmp/manager-copy-preview.html", html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace("<head>", `<head><base href="${base.origin}">`));
        if (path === "/boss") writeFileSync("/tmp/manager-boss-preview.html", html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace("<head>", `<head><base href="${base.origin}">`));
      }
      const deniedConfig = await fetch(new URL(`/account-config/${accountId}`, base), { headers: { cookie: `session=${signSessionToken(control.token)}` }, redirect: "manual" });
      // Next may stream notFound with HTTP 200; the protected editor must never be rendered.
      const deniedHtml = await deniedConfig.text(); assert(!deniedHtml.includes("保存流程与话术"));
      for (const [path, expected] of [
        ["/controller", "直播中控工作台"],
        [`/workbench/accounts/${live.accountId}`, "直播流程"],
        [`/workbench/sessions/${live.id}`, "本场收尾"],
        [`/workbench/accounts/${live.accountId}?sessionId=${live.id}`, "本场收尾"],
        [`/workbench/sessions/${waiting}`, "下一未处理事项"],
        ["/workbench/history", "场次执行记录"],
        ["/workbench/shifts", "上班与设备检查记录"],
      ]) {
        const response = await fetch(new URL(path, base), { headers: { cookie: `session=${signSessionToken(control.token)}` }, redirect: "manual" });
        assert.equal(response.status, 200, path);
        const html = await response.text(); assert(html.includes(expected), path);
        assert(!html.includes("填写本场数据"), path); assert(!html.includes("待补打粉数据"), path); assert(!html.includes("我的直播与打粉数据"), path);
        if (path === `/workbench/sessions/${waiting}`) writeFileSync("/tmp/manager-session-preview.html", html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace("<head>", `<head><base href="${base.origin}">`));
        if (path === `/workbench/accounts/${live.accountId}`) writeFileSync("/tmp/manager-account-flow-preview.html", html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace("<head>", `<head><base href="${base.origin}">`));
        if (path === "/controller") writeFileSync("/tmp/manager-workbench-preview.html", html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace("<head>", `<head><base href="${base.origin}">`));
      }
      const denied = await fetch(new URL(`/workbench/sessions/${live.id}`, base), { headers: { cookie: `session=${signSessionToken(outsider.token)}` } });
      assert.equal(denied.status, 404);
      console.log("PASS: 工作台、账号配置、执行页面、报表预填和历史页面 HTTP 渲染，越权页面 404");
    }
    assert.equal((await home(control.token)).sessions.some(s => s.id === live.id), false);
    assert((await home(control.token)).sessions.every(s => s.report === null));
    await assert.rejects(db.$transaction(tx => saveLiveReport(tx, control.token, reportInput, "test")), /负责人可维护/);
    await db.workSession.update({ where: { id: reportInput.workSessionId }, data: { leadEligible: false } });
    const reportId = await db.$transaction(tx => saveLiveReport(tx, boss.token, reportInput, "test"));
    assert.equal((await read(control.token, live.id))!.session.report, null);
    assert.equal((await read(boss.token, live.id))!.session.report?.id, reportId);
    if (process.env.WORKBENCH_HTTP_BASE) {
      const response = await fetch(new URL(`/workbench/sessions/${live.id}`, process.env.WORKBENCH_HTTP_BASE), { headers: { cookie: `session=${signSessionToken(control.token)}` } });
      assert.equal(response.status, 200); const html = await response.text();
      assert(!html.includes("保存打粉数据")); assert(!html.includes('name="embedded" value="true"'));
      assert(!html.includes("保存更正")); assert(html.includes("本场违规情况"));
      writeFileSync("/tmp/manager-wrap-preview.html", html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace("<head>", `<head><base href="${process.env.WORKBENCH_HTTP_BASE}">`));
      const preview = await fetch(new URL(`/live-reports/${reportId}`, process.env.WORKBENCH_HTTP_BASE), { headers: { cookie: `session=${signSessionToken(control.token)}` } });
      const deniedReport = await preview.text(); assert(!deniedReport.includes("保存打粉数据")); assert(!deniedReport.includes("保存更正"));
      for (const path of ["/live-reports", "/live-reports?view=monetization", "/live-reports?trash=true", "/live-reports/new"]) {
        const response = await fetch(new URL(path, process.env.WORKBENCH_HTTP_BASE), { headers: { cookie: `session=${signSessionToken(control.token)}` } });
        const body = await response.text(); assert(!body.includes('name="entryCount"')); assert(!body.includes('name="effectiveCount"')); assert(!body.includes(`/live-reports/${reportId}`));
      }
      const bossReport = await fetch(new URL(`/live-reports/${reportId}`, process.env.WORKBENCH_HTTP_BASE), { headers: { cookie: `session=${signSessionToken(boss.token)}` } });
      assert.equal(bossReport.status, 200); assert((await bossReport.text()).includes("保存打粉数据"));
    }
    assert.equal(moneyPending((await home(boss.token)).sessions.find(s => s.id === live.id)!.report), true);
    // 新导粉不填带货：完整数据不应因为 hasSales=null 永久待补；旧报表仍保留原规则。
    const originalReport = await db.liveReport.findUniqueOrThrow({ where: { id: reportId } });
    const originalSession = await db.workSession.findUniqueOrThrow({ where: { id: live.id } });
    const isPending = async () => (await home(boss.token)).sessions.some(s => s.id === live.id);
    await db.liveReport.update({ where: { id: reportId }, data: { fanGroupCount: 0, linkClickCount: 0, longPressCount: 0, backendJoinCount: 0, effectiveCount: 0, hasSales: null, salesGmv: null } });
    await db.workSession.update({ where: { id: live.id }, data: { phase: "COMPLETE", leadEligible: true } });
    assert.equal(await isPending(), false, "新导粉完整零值不应要求带货");
    await db.workSession.update({ where: { id: live.id }, data: { phase: "WRAP" } });
    assert.equal(await isPending(), true, "数据完整仍需收尾");
    await db.workSession.update({ where: { id: live.id }, data: { phase: "COMPLETE" } });
    for (const data of [{ effectiveCount: null }, { deletedAt: new Date() }, { monetizationDeletedAt: new Date() }]) {
      await db.liveReport.update({ where: { id: reportId }, data: { effectiveCount: 0, deletedAt: null, monetizationDeletedAt: null, ...data } });
      assert.equal(await isPending(), true, "缺指标或已删除仍提示待处理");
    }
    await db.liveReport.update({ where: { id: reportId }, data: { effectiveCount: 0, deletedAt: null, monetizationDeletedAt: null } });
    await db.workSession.update({ where: { id: live.id }, data: { leadEligible: false } });
    assert.equal(await isPending(), true, "旧报表未确认带货仍待补");
    await db.liveReport.update({ where: { id: reportId }, data: { hasSales: true } });
    assert.equal(await isPending(), true, "旧报表带货但GMV缺失仍待补");
    await db.liveReport.update({ where: { id: reportId }, data: { salesGmv: 432.10 } });
    assert.equal(await isPending(), false);
    await db.workSession.update({ where: { id: live.id }, data: { leadEligible: true } });
    assert.equal(await isPending(), false);
    assert.equal((await db.liveReport.findUniqueOrThrow({ where: { id: reportId } })).salesGmv!.toString(), "432.1", "查询不改历史GMV");
    const completeReport = await db.liveReport.findUniqueOrThrow({ where: { id: reportId } });
    assert.equal(moneyPending({ ...completeReport, hasSales: null }, true), false);
    assert.equal(moneyPending({ ...completeReport, hasSales: null }), true);
    await db.liveReport.update({ where: { id: reportId }, data: { fanGroupCount: originalReport.fanGroupCount, linkClickCount: originalReport.linkClickCount, longPressCount: originalReport.longPressCount, backendJoinCount: originalReport.backendJoinCount, effectiveCount: originalReport.effectiveCount, hasSales: originalReport.hasSales, salesGmv: originalReport.salesGmv } });
    await db.workSession.update({ where: { id: live.id }, data: { phase: originalSession.phase, leadEligible: originalSession.leadEligible } });
    await assert.rejects(db.$transaction(tx => saveLiveReport(tx, boss.token, reportInput, "test")), /已有直播/);
    await db.$transaction(tx => saveDailyWork(tx, control.token, 0, "done", "test"));
    await db.$transaction(tx => saveDailyWork(tx, control.token, 1, "skip", "test"));
    assert.deepEqual((await home(control.token)).daily?.checks, { "0": "done", "1": "skip" });
    assert.equal((await home(operator.token)).daily, null);
    // 原负责人的场次保持可见，接手人不能看交接之前的流程和话术。
    const original = live.accountId === accountId ? a : { ...a, douyinId: `${marker}-b`, name: "账号 B" };
    await db.$transaction(tx => saveAccount(tx, boss.token, { ...original, id: live.accountId, version: 1, controllerId: next.id, branchId: otherBranch.id, operatorId: "" }, "test"));
    assert.equal((await read(control.token, live.id))?.editable, false);
    assert.equal(await read(next.token, live.id), null);
    assert.equal((await read(manager.token, live.id))?.session.sourceRecord.branchId, branch.id);
    // 审计与执行操作原子回滚。
    const ongoing = await db.workSession.findUniqueOrThrow({ where: { id: waiting } });
    const count = await db.workEvent.count({ where: { sessionId: waiting } });
    await assert.rejects(db.$transaction(async tx => { await runWorkCommand(tx, control.token, { id: waiting, version: ongoing.version, command: "issue", note: "rollback" }, "test"); throw new Error("rollback"); }), /rollback/);
    assert.equal(await db.workEvent.count({ where: { sessionId: waiting } }), count);
    await db.session.delete({ where: { id: control.token } });
    await assert.rejects(read(control.token, live.id), /登录或权限/);
    console.log("PASS: 流程维护权限、账号隔离、场次快照、刷新续办、并发开播及数据库兜底、时间重叠、巡检独立记录、交接保护和历史、收尾与数据分离、直播报表关联、日常事项隔离、审计回滚及失效登录");
  } finally {
    try { if (verified) {
      const accounts = await db.douyinAccount.findMany({ where: { douyinId: { startsWith: marker } }, select: { id: true } }), ids = accounts.map(a => a.id);
      const sessions = await db.workSession.findMany({ where: { accountId: { in: ids } }, select: { id: true } });
      await db.workScreenshot.deleteMany({ where: { sessionId: { in: sessions.map(s => s.id) } } });
      await db.workEvent.deleteMany({ where: { sessionId: { in: sessions.map(s => s.id) } } });
      await db.liveReport.deleteMany({ where: { accountId: { in: ids } } });
      await db.workSession.deleteMany({ where: { accountId: { in: ids } } });
      await db.accountWorkflow.deleteMany({ where: { accountId: { in: ids } } });
      await db.accountRecord.deleteMany({ where: { accountId: { in: ids } } });
      await db.douyinAccount.deleteMany({ where: { id: { in: ids } } });
      const users = await db.user.findMany({ where: { username: { startsWith: marker } }, select: { id: true } });
      await db.workShift.deleteMany({ where: { userId: { in: users.map(u => u.id) } } });
      await db.dailyWork.deleteMany({ where: { userId: { in: users.map(u => u.id) } } });
      await db.branch.updateMany({ where: { name: { startsWith: marker } }, data: { managerId: null } });
      await cleanupRun(db, marker);
    } } finally { await db.$disconnect(); }
  }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(e => { console.error(e); process.exitCode = 1; });
