import assert from "node:assert/strict";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
import { saveResource } from "../modules/resources/service";
import { readResourceDetail, readNumberList } from "../modules/resources/data";
import { setBranchManager } from "../modules/accounts/service";
import { signSessionToken } from "../lib/auth/session-token";
async function main() {
  const { dbName } = validateTestEnv(), db = resolveTestClient(), marker = newRunId(); let verified = false;
  try {
    await assertTestDatabase(db, dbName); verified = true;
    const branch = await db.branch.create({ data: { name: `${marker}-branch` } });
    const other = await db.branch.create({ data: { name: `${marker}-other` } });
    async function person(name: string, role: "BOSS" | "OPERATOR" | "CONTROLLER", branchId: string | null) {
      const user = await db.user.create({ data: { username: `${marker}-${name}`, name, role, branchId, passwordHash: "test-only", mustChangePassword: false } });
      const token = `${marker}-${name}`; await db.session.create({ data: { id: token, userId: user.id, expiresAt: new Date(Date.now() + 3600000) } }); return { ...user, token };
    }
    const boss = await person("boss", "BOSS", null), manager = await person("manager", "OPERATOR", branch.id), controller = await person("controller", "CONTROLLER", branch.id), stranger = await person("stranger", "CONTROLLER", branch.id);
    await db.$transaction(tx => setBranchManager(tx, boss.token, { branchId: branch.id, managerId: manager.id, previousManagerId: "" }, "test"));
    const digits = String(Date.now()).slice(-10); let index = 10;
    const save = (data: object, token = manager.token) => db.$transaction(tx => saveResource(tx, token, "numbers", { id: "", version: 0, branchId: branch.id, cardType: "MAIN", status: "NORMAL", carrier: "中国电信", ...data }, "test"));
    const create = (data: object = {}) => save({ number: `${index++}${digits}`, ...data });
    const read = (id: string, token = manager.token) => db.$transaction(tx => readResourceDetail(tx, token, "numbers", id));
    const edit = async (id: string, data: object) => save({ ...(await read(id))!.initial, ...data });
    const mainCard = await create({ openedBy: `${marker}-开户`, monthlyFee: "129.99", dataGb: "100.50", wechat: "wechat-test", xiaohongshu: "xhs-test", kuaishou: "ks-test", userId: controller.id, otherPhone: "个人手机", phoneDeviceId: "other", notes: "保留备注" });
    assert.equal((await db.phoneNumber.findUniqueOrThrow({ where: { id: mainCard } })).monthlyFeeCents, 12999);
    const sub = await create({ cardType: "SECONDARY", mainCardId: mainCard, monthlyFee: "999", dataGb: "999", userId: controller.id });
    assert.equal((await db.phoneNumber.findUniqueOrThrow({ where: { id: sub } })).monthlyFeeCents, null);
    assert.equal((await read(sub))!.initial.monthlyFee, "129.99");
    await edit(mainCard, { monthlyFee: "88.08", dataGb: "80" });
    assert.equal((await read(sub))!.initial.monthlyFee, "88.08"); assert.equal((await read(sub))!.initial.dataGb, "80");
    assert((await read(mainCard))!.related.some(r => r.href.endsWith(sub)));
    await assert.rejects(edit(mainCard, { cardType: "SECONDARY", mainCardId: sub }), /有效主卡/);
    await assert.rejects(edit(mainCard, { status: "CANCELLED" }), /所属副卡/);
    await assert.rejects(edit(mainCard, { cardType: "SECONDARY", mainCardId: mainCard }), /有效主卡/);
    await assert.rejects(create({ cardType: "SECONDARY" }), /有效主卡/);
    const foreignMain = await save({ branchId: other.id, number: `90${digits}`, monthlyFee: "10" }, boss.token);
    await assert.rejects(create({ cardType: "SECONDARY", mainCardId: foreignMain }), /有效主卡/);
    await assert.rejects(create({ monthlyFee: "1.001" }), /金额/);
    await assert.rejects(create({ dataGb: "-1" }), /流量/);
    await assert.rejects(create({ carrier: "未知运营商" }), /运营商/);
    await assert.rejects(create({ phoneDeviceId: "other" }), /说明/);
    const phoneId = await db.$transaction(tx => saveResource(tx, manager.token, "phones", { id: "", version: 0, branchId: branch.id, code: `${marker}-phone`, model: "双卡手机", quantity: "1" }, "test"));
    await edit(mainCard, { phoneDeviceId: phoneId, phoneSlot: "1" });
    assert.equal((await db.deviceSlot.findUniqueOrThrow({ where: { phoneNumberId: mainCard } })).deviceId, phoneId);
    assert.equal((await read(mainCard))!.initial.otherPhone, "");
    const stalePhone = (await db.$transaction(tx => readResourceDetail(tx, manager.token, "phones", phoneId)))!.initial;
    await edit(sub, { phoneDeviceId: phoneId, phoneSlot: "2" });
    await assert.rejects(db.$transaction(tx => saveResource(tx, manager.token, "phones", stalePhone, "test")), /已被修改/);
    await assert.rejects(create({ phoneDeviceId: phoneId, phoneSlot: "1" }), /占用/);
    const staleNumber = (await read(mainCard))!.initial;
    const phone = (await db.$transaction(tx => readResourceDetail(tx, manager.token, "phones", phoneId)))!.initial;
    await db.$transaction(tx => saveResource(tx, manager.token, "phones", { ...phone, sim1: "" }, "test"));
    await assert.rejects(save(staleNumber), /已被修改/);
    assert.equal((await read(mainCard))!.initial.phoneDeviceId, "");
    await edit(mainCard, { phoneDeviceId: "other", otherPhone: "王某个人手机" });
    assert.equal((await read(mainCard))!.initial.otherPhone, "王某个人手机");
    const legacy = await db.phoneNumber.create({ data: { branchId: branch.id, number: `80${digits}`, carrier: "历史运营商", plan: "原有套餐描述", active: false } });
    await edit(legacy.id, { notes: "仅编辑备注" });
    const kept = await db.phoneNumber.findUniqueOrThrow({ where: { id: legacy.id } });
    assert.equal(kept.plan, "原有套餐描述"); assert.equal(kept.carrier, "历史运营商"); assert.equal(kept.monthlyFeeCents, null); assert.equal(kept.cardType, null); assert.equal(kept.active, false);
    for (let n = 0; n < 11; n++) await create({ openedBy: `${marker}-分页`, status: n === 10 ? "CANCELLED" : "NORMAL" });
    const listing = (page: number, filters = {}) => db.$transaction(tx => readNumberList(tx, manager.token, "", page, filters, 10));
    const first = await listing(1, { openedBy: `${marker}-分页` }), second = await listing(2, { openedBy: `${marker}-分页` });
    assert.equal(first.total, 11); assert.equal(first.rows.length, 10); assert.equal(second.rows.length, 1); assert(!first.rows.some(r => second.rows.some(s => s.id === r.id)));
    assert.equal((await listing(99, { openedBy: `${marker}-分页` })).page, 2);
    assert.equal((await listing(1, { openedBy: `${marker}-分页`, status: "CANCELLED" })).total, 1);
    assert.equal((await listing(1, { userId: controller.id })).total, 2);
    const own = await db.$transaction(tx => readNumberList(tx, controller.token, "", 1));
    assert.equal(own.total, 2); assert.equal(own.manager, false);
    assert.equal((await db.$transaction(tx => readNumberList(tx, stranger.token, "", 1))).total, 0);
    assert.equal(await read(mainCard, stranger.token), null);
    await assert.rejects(save({ ...(await read(mainCard))!.initial }, controller.token), /仅老板/);
    const base = process.env.RESOURCES_HTTP_BASE;
    if (base) {
      const response = await fetch(`${base}/resources/numbers?openedBy=${encodeURIComponent(marker+'-分页')}&pageSize=10`, { headers: { Cookie: `session=${signSessionToken(manager.token)}` } });
      assert.equal(response.status, 200); const html = await response.text();
      for (const text of ["绑定小红书", "绑定快手号", "开户人", "全部状态", "下一页"]) assert(html.includes(text), text);
      const detail = await fetch(`${base}/resources/numbers/${sub}`, { headers: { Cookie: `session=${signSessionToken(manager.token)}` } });
      assert.equal(detail.status, 200); const body = await detail.text(); for (const text of ["套餐流量", "所属主卡", "所在手机", "共享套餐主卡", "绑定账号管理"]) assert(body.includes(text), text);
      console.log("PASS: real HTTP list filters, pagination and linked editor rendering");
    }
    console.log("PASS: shared plans, legacy preservation, bidirectional slots and concurrency, account fields, scoped filters and pagination");
  } finally {
    if (verified) {
      const branches = await db.branch.findMany({ where: { name: { startsWith: marker } }, select: { id: true } }); const ids = branches.map(b => b.id);
      await db.deviceSlot.deleteMany({ where: { branchId: { in: ids } } }); await db.assetDevice.deleteMany({ where: { branchId: { in: ids } } });
      await db.phoneNumber.deleteMany({ where: { branchId: { in: ids }, mainCardId: { not: null } } }); await db.phoneNumber.deleteMany({ where: { branchId: { in: ids } } });
      await db.branch.updateMany({ where: { id: { in: ids } }, data: { managerId: null } }); await cleanupRun(db, marker);
    }
    await db.$disconnect();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
