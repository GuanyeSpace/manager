import assert from "node:assert/strict";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
import { mutateBranch } from "../modules/branches/service";
import { acquireUserMutationLock } from "../modules/users/boss-guard";

async function main() {
  const { dbName } = validateTestEnv(), db = resolveTestClient(), marker = newRunId();
  let verified = false;
  try {
    await assertTestDatabase(db, dbName); verified = true;
    const user = await db.user.create({ data: { username: marker, name: "分公司测试", passwordHash: "not-real", role: "BOSS", mustChangePassword: false } });
    const token = marker;
    await db.session.create({ data: { id: token, userId: user.id, expiresAt: new Date(Date.now() + 60000) } });
    const run = (command: "create" | "rename" | "toggle", raw: unknown) => db.$transaction(tx => mutateBranch(tx, token, command, raw, "test"));
    const id = await run("create", { name: marker });
    await run("rename", { branchId: id, name: marker + "renamed" });
    await run("toggle", { branchId: id });
    assert.equal((await db.branch.findUniqueOrThrow({ where: { id } })).status, "INACTIVE");
    assert.equal(await db.auditLog.count({ where: { actorId: user.id } }), 3);
    const count = await db.auditLog.count({ where: { actorId: user.id } });
    await assert.rejects(db.$transaction(async tx => { await mutateBranch(tx, token, "toggle", { branchId: id }, "test"); throw Error("rollback"); }), /rollback/);
    assert.equal((await db.branch.findUniqueOrThrow({ where: { id } })).status, "INACTIVE");
    assert.equal(await db.auditLog.count({ where: { actorId: user.id } }), count);
    // 在管理锁等待期间撤销会话；通过数据库真实阻塞确认旧请求没有提前写入。
    let locked!: () => void, release!: () => void;
    const ready = new Promise<void>(r => { locked = r; }), gate = new Promise<void>(r => { release = r; });
    let holderPid = 0;
    const holder = db.$transaction(async tx => {
      await acquireUserMutationLock(tx);
      holderPid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
      await tx.session.delete({ where: { id: token } }); locked(); await gate;
    }, { timeout: 15000 });
    await ready;
    const pending = run("rename", { branchId: id, name: marker + "forbidden" }).then(() => ({ ok: true, error: "" }), e => ({ ok: false, error: String(e.message) }));
    let blocked = false;
    try {
      for (let n = 0; n < 100; n++) {
        const rows = await db.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${holderPid} = ANY(pg_blocking_pids(pid))) AS blocked`;
        if (rows[0].blocked) { blocked = true; break; }
        await new Promise(r => setTimeout(r, 20));
      }
    } finally { release(); }
    await holder;
    const result = await pending;
    assert(blocked, "必须观察到管理锁等待"); assert.equal(result.ok, false); assert.match(result.error, /登录或权限已变化/);
    assert.equal((await db.branch.findUniqueOrThrow({ where: { id } })).name, marker + "renamed");
    assert.equal(await db.auditLog.count({ where: { actorId: user.id } }), count);
    await db.session.create({ data: { id: token, userId: user.id, expiresAt: new Date(Date.now() + 60000) } });
    for (const data of [{ role: "OPERATOR" as const }, { role: "BOSS" as const, mustChangePassword: true }, { mustChangePassword: false, employmentStatus: "RESIGNED" as const }]) {
      await db.user.update({ where: { id: user.id }, data });
      for (const command of ["create", "rename", "toggle"] as const) await assert.rejects(run(command, { branchId: id, name: marker + "denied" }), /权限|老板/);
    }
    console.log("PASS: 分公司增改启停、锁内复核、真实会话撤销竞争、降岗/离职/强制改密拒绝、审计回滚");
  } finally { try { if (verified) await cleanupRun(db, marker); } finally { await db.$disconnect(); } }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(error => { console.error(error); process.exitCode = 1; });
