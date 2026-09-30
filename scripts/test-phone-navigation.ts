import assert from "node:assert/strict";
import { hash } from "bcryptjs";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
import { saveResource } from "../modules/resources/service";
import { readResourceDetail, readPhoneList, readNumberList, readResourceList } from "../modules/resources/data";
import { saveAccount } from "../modules/accounts/service";
import { readAccountDetail } from "../modules/accounts/data";
import { followHref, parseTrail, withTrail } from "../lib/navigation-trail";
import { signSessionToken } from "../lib/auth/session-token";
import { writeFileSync } from "node:fs";

async function main() {
  const origin = "https://manager.invalid";
  const list = "/resources/numbers?q=138&openedBy=张三&page=2&pageSize=20&status=NORMAL";
  const n = followHref("/resources/numbers/number1", list);
  const phone = followHref("/resources/phones/phone1", n);
  const trail = parseTrail(new URL(phone, origin).searchParams.get("via"));
  assert.equal(withTrail(trail[1], trail.slice(0, 1)), n);
  assert.equal(decodeURI(trail[0]), list);
  assert.equal(followHref("/resources/numbers/number1", phone), n);
  assert.equal(withTrail("/resources/phones/phone1", trail), phone);
  assert.deepEqual(parseTrail('["https://evil.example","//evil.example","/login","/boss/../../evil"]'), []);
  assert.equal(followHref("https://evil.example", list), "https://evil.example");
  const { dbName } = validateTestEnv(), db = resolveTestClient(), marker = newRunId(); let verified = false;
  try {
    await assertTestDatabase(db, dbName); verified = true;
    const a = await db.branch.create({ data: { name: marker } }), b = await db.branch.create({ data: { name: marker + "other" } });
    const boss = await db.user.create({ data: { username: marker, name: "页面验收", role: "BOSS", mustChangePassword: false, passwordHash: await hash("Navigation-test-only-2026", 10) } });
    const employee = await db.user.create({ data: { username: marker + "employee", name: "测试使用人", role: "CONTROLLER", branchId: a.id, mustChangePassword: false, passwordHash: "not-real" } });
    const other = await db.user.create({ data: { username: marker + "other", name: "其他中控", role: "CONTROLLER", branchId: a.id, mustChangePassword: false, passwordHash: "not-real" } });
    for (const u of [boss, employee]) await db.session.create({ data: { id: u.id, userId: u.id, expiresAt: new Date(Date.now() + 3600000) } });
    const baseAccount = { id: "", version: 0, douyinId: marker, name: "验收抖音账号", homepageUrl: "", realName: "", phone: "", purpose: "", notes: "", branchId: a.id, operatorId: "", controllerId: other.id, anchorId: "", active: "true" as const };
    const account = await db.$transaction(tx => saveAccount(tx, boss.id, baseAccount, "test"));
    const save = (data: object, token = boss.id) => db.$transaction(tx => saveResource(tx, token, "phones", data, "test"));
    const device = await save({ id: "", version: 0, branchId: a.id, code: marker + "-P01", model: "iPhone 15", userId: employee.id, quantity: "1", loginAccountIds: [account, account], loginWechats: "wx_one\nwx_two\nwx_one" });
    assert.equal(await db.phoneAccountLogin.count({ where: { deviceId: device } }), 1);
    assert.equal((await db.assetDevice.findUniqueOrThrow({ where: { id: device } })).loginWechats, "wx_one\nwx_two");
    const detail = () => db.$transaction(tx => readResourceDetail(tx, boss.id, "phones", device));
    let initial = (await detail())!.initial;
    assert.deepEqual(initial.loginAccountIds, [account]);
    assert.equal((await db.$transaction(tx => readAccountDetail(tx, boss.id, account))).phones[0].id, device);
    await assert.rejects(save({ ...initial, branchId: b.id, userId: "" }), /登录抖音号/);
    await assert.rejects(db.$transaction(tx => saveAccount(tx, boss.id, { ...baseAccount, id: account, version: 1, branchId: b.id, controllerId: boss.id }, "test")), /手机登录关联/);
    await assert.rejects(save(initial, employee.id), /仅老板/);
    const visible = await db.$transaction(tx => readPhoneList(tx, employee.id, "", 1));
    assert.equal(visible.rows.length, 1); assert.equal(visible.rows[0].phoneLogins.length, 0);
    assert.equal((await db.$transaction(tx => readPhoneList(tx, employee.id, marker, 1))).rows.length, 1);
    assert.equal((await db.$transaction(tx => readPhoneList(tx, employee.id, "验收抖音账号", 1))).rows.length, 0);
    const digits = String(Date.now()).slice(-10);
    for (let i = 0; i < 51; i++) await db.phoneNumber.create({ data: { branchId: a.id, number: `${100+i}${digits}`, openedBy: marker, userId: employee.id, status: "NORMAL", wechat: "sim_bound_wechat" } });
    const all = await db.phoneNumber.findMany({ where: { openedBy: marker }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    await save({ ...initial, sim1: all[20].id });
    initial = (await detail())!.initial;
    assert.deepEqual(initial.loginAccountIds, [account]); assert.equal(initial.loginWechats, "wx_one\nwx_two");
    await assert.rejects(save({ ...initial, version: initial.version - 1, loginAccountIds: [] }), /已被修改/);
    const audit = await db.auditLog.findFirstOrThrow({ where: { targetId: device }, orderBy: { createdAt: "desc" } });
    assert.match(JSON.stringify(audit.detail), /previousLoginAccountIds/);
    for (const size of [10,20,50]) {
      const first = await db.$transaction(tx => readNumberList(tx, boss.id, "", 1, { openedBy: marker }, size));
      const second = await db.$transaction(tx => readNumberList(tx, boss.id, "", 2, { openedBy: marker }, size));
      assert.equal(first.total, 51); assert.equal(first.rows.length, size); assert.equal(second.rows.length, Math.min(size, 51-size));
      assert.ok(first.rows.every(r => !second.rows.some(s => s.id === r.id)));
    }
    assert.equal((await db.$transaction(tx => readNumberList(tx, boss.id, "", 1, { openedBy: marker }))).pageSize, 20);
    assert.equal((await db.$transaction(tx => readNumberList(tx, boss.id, "", 1, { openedBy: marker }, 999))).pageSize, 20);
    assert.equal((await db.$transaction(tx => readPhoneList(tx, boss.id, marker, 999, 20))).page, 1);
    assert.equal((await db.$transaction(tx => readResourceList(tx, boss.id, "equipment", marker, 999))).page, 1);
    const base = process.env.TEST_HTTP_BASE;
    const start = `/resources/numbers?openedBy=${marker}&page=2&pageSize=20`;
    if (base) {
      const headers = { Cookie: `session=${signSessionToken(boss.id)}` };
      for (const path of [start, `/resources/phones?q=${marker}`, followHref(`/resources/phones/${device}`, followHref(`/resources/numbers/${all[20].id}`, start))]) {
        const response: Response = await fetch(base + path, { headers }); assert.equal(response.status, 200, path);
        const html = await response.text(); assert.doesNotMatch(html, /Application error/); assert.match(html, /手机号管理/);
        if (path.startsWith("/resources/phones?")) { assert.match(html, /登录抖音号/); assert.match(html, /wx_one/); assert.match(html, /卡槽/); }
        if (path.includes("via=")) assert.match(html, /返回手机号管理详情/);
      }
    }
    console.log("PASS: 逐级返回及筛选保留、安全来源、10/20/50分页、登录账号独立登记、换卡保留、双向关联、越权隔离、调拨与版本保护、审计");
    if (process.env.TEST_UI_HOLD === "true") {
      writeFileSync("/tmp/manager-nav-fixture.json", JSON.stringify({ username: boss.username, start, device, number: all[20].number }), { mode: 0o600 });
      console.log("UI fixture ready at /tmp/manager-nav-fixture.json; send newline to clean up");
      process.stdin.resume(); await new Promise<void>(resolve => process.stdin.once("data", () => resolve())); process.stdin.pause();
    }
  } finally {
    try { if (verified) {
      const ids = (await db.assetDevice.findMany({ where: { code: { startsWith: marker } }, select: { id: true } })).map(x => x.id);
      const accounts = (await db.douyinAccount.findMany({ where: { douyinId: { startsWith: marker } }, select: { id: true } })).map(x => x.id);
      await db.phoneAccountLogin.deleteMany({ where: { deviceId: { in: ids } } });
      await db.deviceSlot.deleteMany({ where: { deviceId: { in: ids } } });
      await db.assetDevice.deleteMany({ where: { id: { in: ids } } });
      await db.accountRecord.deleteMany({ where: { accountId: { in: accounts } } });
      await db.douyinAccount.deleteMany({ where: { id: { in: accounts } } });
      await db.phoneNumber.deleteMany({ where: { openedBy: marker } });
      await cleanupRun(db, marker);
    } } finally { await db.$disconnect(); }
  }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(e => { console.error(e); process.exitCode = 1; });
