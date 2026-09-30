import assert from "node:assert/strict";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
import { saveOwnProfile } from "../modules/profile/service";
async function main() {
  const { dbName } = validateTestEnv(); const db = resolveTestClient(); const marker = newRunId(); let verified = false;
  try {
    await assertTestDatabase(db, dbName); verified = true;
    const user = await db.user.create({ data: { username: marker, name: "真实姓名", role: "CONTROLLER", passwordHash: "test-only", mustChangePassword: false } });
    const other = await db.user.create({ data: { username: marker + "-other", name: "其他员工", role: "CONTROLLER", passwordHash: "test-only", mustChangePassword: false } });
    const token = marker + "-session";
    await db.session.create({ data: { id: token, userId: user.id, expiresAt: new Date(Date.now() + 3600000) } });
    const save = (raw: unknown) => db.$transaction(tx => saveOwnProfile(tx, token, raw, "test"));
    await save({ version: 0, nickname: "小星", contactPhone: "13800000000", id: other.id, role: "BOSS", name: "篡改姓名" });
    const saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(saved.name, "真实姓名"); assert.equal(saved.role, "CONTROLLER"); assert.equal(saved.nickname, "小星");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: other.id } })).nickname, "");
    await assert.rejects(save({ version: 0, nickname: "覆盖", contactPhone: "" }), /已更新/);
    await assert.rejects(save({ version: 1, nickname: "", contactPhone: "invalid" }));
    const concurrent = await Promise.allSettled([save({ version: 1, nickname: "甲", contactPhone: "" }), save({ version: 1, nickname: "乙", contactPhone: "" })]);
    assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(await db.auditLog.count({ where: { actorId: user.id, targetType: "User" } }), 2);
    await assert.rejects(db.$transaction(async tx => { await saveOwnProfile(tx, token, { version: 2, nickname: "回滚", contactPhone: "" }, "test"); throw Error("rollback"); }), /rollback/);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).profileVersion, 2);
    await db.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    await assert.rejects(save({ version: 2, nickname: "", contactPhone: "" }), /登录或权限/);
    await db.session.delete({ where: { id: token } });
    await assert.rejects(save({ version: 2, nickname: "", contactPhone: "" }), /登录或权限/);
    console.log("PASS: own fields only, immutable employee identity, stale/concurrent writes, validation, audit, rollback and revoked session");
  } finally { try { if (verified) await cleanupRun(db, marker); } finally { await db.$disconnect(); } }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(e => { console.error(e); process.exitCode = 1; });
