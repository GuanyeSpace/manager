import assert from "node:assert/strict";
import { hash } from "bcryptjs";
import { writeFile } from "node:fs/promises";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
import { signSessionToken } from "../lib/auth/session-token";
import { saveAccount } from "../modules/accounts/service";
import { defaultWorkflow } from "../modules/workbench/schema";
import { runWorkCommand } from "../modules/workbench/service";
async function main() {
  const { dbName } = validateTestEnv(); const db = resolveTestClient(); const marker = newRunId(); let verified = false;
  try {
    await assertTestDatabase(db, dbName); verified = true;
    const branch = await db.branch.create({ data: { name: marker } });
    const passwordHash = await hash("Controller-test-only-2026", 10);
    const boss = await db.user.create({ data: { username: marker + "-boss", name: "测试老板", role: "BOSS", passwordHash, mustChangePassword: false } });
    const user = await db.user.create({ data: { username: marker, name: "测试中控", role: "CONTROLLER", branchId: branch.id, passwordHash, mustChangePassword: false } });
    const bossToken = marker + "-boss-token", userToken = marker + "-user-token";
    for (const [id, userId] of [[bossToken, boss.id], [userToken, user.id]]) await db.session.create({ data: { id, userId, expiresAt: new Date(Date.now() + 3600000) } });
    const input = { id: "", version: 0, douyinId: marker, name: "直播测试账号", homepageUrl: "", realName: "", phone: "", purpose: "", notes: "", branchId: branch.id, operatorId: "", controllerId: user.id, anchorId: "", active: "true" as const };
    const accountId = await db.$transaction(tx => saveAccount(tx, bossToken, input, "test"));
    const cardId = await db.$transaction(tx => saveAccount(tx, bossToken, { ...input, douyinId: marker + "-card", name: "发卡片账号", controllerId: "" }, "test"));
    await assert.rejects(db.$transaction(tx => runWorkCommand(tx, bossToken, { command: "create", id: cardId, version: 0 }, "test")), /绑定直播中控/);
    for (let i = 1; i <= 11; i++) await db.$transaction(tx => saveAccount(tx, bossToken, { ...input, douyinId: marker + "-live-" + i, name: `直播账号 ${i}` }, "test"));
    const source = await db.accountRecord.findFirstOrThrow({ where: { accountId } });
    const wrap = await db.workSession.create({ data: { accountId, sourceRecordId: source.id, controllerId: user.id, loginUserId: user.id, phase: "WRAP", workflow: defaultWorkflow, workflowVersion: 1, label: "隔离测试待收尾" } });
    const base = process.env.TEST_HTTP_BASE;
    if (base) {
      const get = async (path: string, token = userToken) => {
        const response = await fetch(base + path, { headers: { Cookie: `session=${signSessionToken(token)}` }, redirect: "manual" });
        assert.equal(response.status, 200, path); return response.text();
      };
      const home = await get("/controller");
      for (const label of ["上班/下班", "直播工作", "场次纪录", "上班纪录", "负责手机号", "负责物资", "个人资料"]) assert.ok(home.includes(label), label);
      for (const removed of ["你好，", "上班登记与设备检查", "本人相关资料"]) assert.ok(!home.includes(removed), removed);
      assert.ok(home.includes("lg:grid-cols-3")); assert.ok(home.includes('aria-label="直播账号列表"'));
      assert.ok(home.includes(`/workbench/sessions/${wrap.id}`));
      assert.ok(!home.includes(`/workbench/accounts/${cardId}`));
      assert.ok((await get(`/workbench/accounts/${accountId}`)).includes("直播测试账号"));
      assert.ok((await get(`/workbench/sessions/${wrap.id}`)).includes("隔离测试待收尾"));
      assert.ok(!home.includes('value="shiftStart"')); assert.ok(!home.includes("执行工作 / 本人资料"));
      assert.ok((await get("/workbench/attendance")).includes('value="shiftStart"'));
      const profile = await get("/controller/profile"); assert.ok(profile.includes('name="nickname"')); assert.ok(profile.includes('name="oldPassword"'));
      assert.ok(!(await get("/controller/profile?id=" + boss.id)).includes("测试老板"));
      assert.ok((await get("/accounts/" + cardId, bossToken)).includes("发卡片账号"));
      console.log("PASS: isolated HTTP navigation, dedicated shift page, self profile and nullable controller detail");
    }
    if (process.env.TEST_UI_HOLD === "true") {
      await writeFile("/tmp/manager-controller-fixture.json", JSON.stringify({ username: user.username, bossUsername: boss.username, accountId, cardId, wrapId: wrap.id }), { mode: 0o600 });
      console.log("Browser fixture ready; press Enter to clean up.");
      await new Promise<void>(resolve => { process.stdin.resume(); process.stdin.once("data", () => { process.stdin.pause(); resolve(); }); });
    }
  } finally {
    try {
      if (verified) {
        const users = await db.user.findMany({ where: { username: { startsWith: marker } }, select: { id: true } });
        await db.workSession.deleteMany({ where: { account: { douyinId: { startsWith: marker } } } });
        await db.workShift.deleteMany({ where: { userId: { in: users.map(u => u.id) } } });
        await db.accountRecord.deleteMany({ where: { account: { douyinId: { startsWith: marker } } } });
        await db.douyinAccount.deleteMany({ where: { douyinId: { startsWith: marker } } });
        await cleanupRun(db, marker);
      }
    } finally { await db.$disconnect(); }
  }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(e => { console.error(e); process.exitCode = 1; });
