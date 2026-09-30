import assert from "node:assert/strict";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
import { Role } from "../app/generated/prisma/enums";
import { userRoles, hasRole, roleWhere } from "../lib/auth/roles";
import { createUserSchema } from "../modules/users/schema";
import { createUserMutation, updateUserMutation } from "../modules/users/user-mutations";
import { assertActiveBossInvariant } from "../modules/users/boss-guard";
import { saveAccount } from "../modules/accounts/service";
import { readAccountOptions } from "../modules/accounts/data";
import { runLeadCommand, readLeadTask, readLeadList } from "../modules/leads/service";
import { leadValues, leadFields } from "../modules/leads/schema";
import { runWorkCommand } from "../modules/workbench/service";
import { shanghaiInput } from "../modules/live-reports/schema";
import { readLiveReport, readLiveReports } from "../modules/live-reports/data";
import { signSessionToken } from "../lib/auth/session-token";

async function main() {
  const { dbName } = validateTestEnv(), db = resolveTestClient(), marker = newRunId();
  let verified = false;
  try {
    await assertTestDatabase(db, dbName); verified = true;
    const branch = await db.branch.create({ data: { name: marker } });
    const person = async (name: string, role: Role, roles: Role[] = []) => {
      const u = await db.user.create({ data: { username: marker + name, name, role, roles, branchId: branch.id, passwordHash: "not-real", mustChangePassword: false } });
      const token = marker + name;
      await db.session.create({ data: { id: token, userId: u.id, expiresAt: new Date(Date.now() + 3600000) } });
      return { ...u, token };
    };
    const boss = await person("boss", Role.BOSS), controller = await person("controller", Role.CONTROLLER), other = await person("other", Role.LEAD_SPECIALIST), both = await person("both", Role.LEAD_SPECIALIST, [Role.CONTROLLER, Role.OPERATOR]);
    assert.deepEqual(userRoles(controller), [Role.CONTROLLER]);
    const accountInput = { id: "", version: 0, douyinId: marker + "account", name: "多岗测试", homepageUrl: "", realName: "", phone: "", purpose: "", notes: "", branchId: branch.id, operatorId: both.id, controllerId: controller.id, anchorId: "", active: "true" as const };
    const accountId = await db.$transaction(tx => saveAccount(tx, boss.token, accountInput, "test"));
    const source = await db.accountRecord.findFirstOrThrow({ where: { accountId } });
    const update = (roles: Role[], expectedRoles?: string) => db.$transaction(tx => updateUserMutation(tx, boss.id, boss.token, controller.id, { name: controller.name, role: roles[0], roles, branchId: branch.id, expectedRoles }));
    await update([Role.CONTROLLER, Role.LEAD_SPECIALIST], Role.CONTROLLER);
    const fresh = await db.user.findUniqueOrThrow({ where: { id: controller.id } });
    assert.deepEqual(userRoles(fresh), [Role.CONTROLLER, Role.LEAD_SPECIALIST]);
    await assert.rejects(update([Role.LEAD_SPECIALIST]), /交接/);
    await assert.rejects(update([Role.CONTROLLER], Role.CONTROLLER), /岗位已被修改/);
    const options = await db.$transaction(tx => readAccountOptions(tx, boss.token));
    assert.ok(hasRole(options.people.find(p => p.id === both.id)!, Role.CONTROLLER));
    assert.equal(await db.user.count({ where: { id: controller.id, AND: [roleWhere(Role.LEAD_SPECIALIST)] } }), 1);
    const input = { name: "new", username: marker + "new", initialPassword: "12345678", branchId: branch.id, roles: [Role.CONTROLLER, Role.LEAD_SPECIALIST] };
    assert.ok(createUserSchema.safeParse(input).success);
    assert.equal(createUserSchema.safeParse({ ...input, roles: [] }).success, false);
    assert.equal(createUserSchema.safeParse({ ...input, roles: ["INVALID"] }).success, false);
    const created = await db.$transaction(tx => createUserMutation(tx, boss.id, boss.token, { ...input, role: Role.CONTROLLER, passwordHash: "not-real" }));
    assert.deepEqual(userRoles(created), input.roles);
    const workflow = { before: [], live: [], after: [], materials: "", scripts: [] };
    const own = await db.workSession.create({ data: { accountId, sourceRecordId: source.id, controllerId: controller.id, loginUserId: controller.id, actualControllerId: controller.id, label: "本人中控场次", phase: "LIVE", workflow, workflowVersion: 1, startedAt: new Date(Date.now() - 600000) } });
    const sessions = [];
    for (let i = 0; i < 3; i++) {
      const actual = i === 0 ? both : await person("room-controller" + i, Role.CONTROLLER);
      const a = await db.$transaction(tx => saveAccount(tx, boss.token, { ...accountInput, douyinId: marker + i, controllerId: actual.id }, "test"));
      const r = await db.accountRecord.findFirstOrThrow({ where: { accountId: a } });
      sessions.push(await db.workSession.create({ data: { accountId: a, sourceRecordId: r.id, controllerId: actual.id, label: "其他直播间" + i, phase: "LIVE", workflow, workflowVersion: 1, startedAt: new Date(Date.now() - 600000) } }));
    }
    const claim = (token: string, id: string) => db.$transaction(tx => runLeadCommand(tx, token, { command: "claim", id, version: 0 }, "test"));
    const tasks = [await claim(controller.token, sessions[0].id), await claim(controller.token, sessions[1].id)];
    const otherTask = await claim(other.token, sessions[2].id);
    assert.equal((await db.$transaction(tx => readLeadList(tx, controller.token, "work"))).count, 2);
    assert.equal((await db.workSession.findUniqueOrThrow({ where: { id: own.id } })).phase, "LIVE");
    assert.equal(await db.$transaction(tx => readLeadTask(tx, controller.token, otherTask)), null);
    const operatorRead = await db.$transaction(tx => readLeadTask(tx, both.token, tasks[0]));
    assert.ok(operatorRead); assert.equal(operatorRead.editable, false);
    const values = leadValues(Object.fromEntries(leadFields.map(([k]) => [k, "0"]))); values.durationMinutes = "1";
    await db.$transaction(tx => runLeadCommand(tx, controller.token, { command: "save", id: tasks[0], version: 1, data: values }, "test"));
    await assert.rejects(db.$transaction(tx => runLeadCommand(tx, both.token, { command: "save", id: tasks[0], version: 2, data: values }, "test")), /无修改权限/);
    await db.workSession.update({ where: { id: sessions[0].id }, data: { phase: "COMPLETE", endedAt: new Date() } });
    await db.$transaction(tx => runLeadCommand(tx, controller.token, { command: "complete", id: tasks[0], version: 2, data: values }, "test"));
    const report = await db.liveReport.findUniqueOrThrow({ where: { workSessionId: sessions[0].id } });
    assert.ok(await db.$transaction(tx => readLiveReport(tx, controller.token, report.id)));
    assert.ok(await db.$transaction(tx => readLiveReport(tx, both.token, report.id)));
    const pendingAccount = await db.$transaction(tx => saveAccount(tx, boss.token, { ...accountInput, douyinId: marker + "pending" }, "test"));
    const pendingSource = await db.accountRecord.findFirstOrThrow({ where: { accountId: pendingAccount } });
    const pending = await db.workSession.create({ data: { accountId: pendingAccount, sourceRecordId: pendingSource.id, controllerId: controller.id, label: "第二场", phase: "PREPARING", workflow, workflowVersion: 1 } });
    await assert.rejects(db.$transaction(tx => runWorkCommand(tx, controller.token, { command: "start", id: pending.id, version: 1, time: shanghaiInput(new Date()) }, "test")), /已有直播中的场次/);
    const base = process.env.TEST_HTTP_BASE;
    if (base) {
      for (const path of ["/controller", "/leads", `/leads/${tasks[0]}`]) {
        const r: Response = await fetch(base + path, { headers: { Cookie: `session=${signSessionToken(controller.token)}` } });
        assert.equal(r.status, 200, path); const html = await r.text();
        assert.match(html, /工作台切换/); assert.match(html, /直播中控工作台/); assert.match(html, /导粉工作台/);
      }
      for (const path of ["/boss/users/new", `/boss/users/${controller.id}`]) {
        const r: Response = await fetch(base + path, { headers: { Cookie: `session=${signSessionToken(boss.token)}` } });
        assert.equal(r.status, 200); assert.match(await r.text(), /name="roles"/);
      }
    }
    await update([Role.CONTROLLER]);
    assert.equal(await db.$transaction(tx => readLeadTask(tx, controller.token, tasks[0])), null);
    assert.equal((await db.$transaction(tx => readLiveReports(tx, controller.token, { accountId: "", from: "", to: "", page: 1 }))).count, 0);
    await assert.rejects(claim(controller.token, own.id), /仅导粉/);
    assert.equal((await db.leadTask.findUniqueOrThrow({ where: { id: tasks[0] } })).userId, controller.id);
    assert.equal((await db.douyinAccount.findUniqueOrThrow({ where: { id: accountId } })).controllerId, controller.id);
    const snapshot = Role.CONTROLLER;
    const race = await Promise.allSettled([update([Role.CONTROLLER, Role.LEAD_SPECIALIST], snapshot), update([Role.CONTROLLER, Role.ANCHOR], snapshot)]);
    assert.equal(race.filter(r => r.status === "fulfilled").length, 1);
    await db.$transaction(tx => updateUserMutation(tx, boss.id, boss.token, boss.id, { name: "boss", role: Role.CONTROLLER, roles: [Role.CONTROLLER, Role.BOSS, Role.LEAD_SPECIALIST] }));
    const updatedBoss = await db.user.findUniqueOrThrow({ where: { id: boss.id } });
    assert.equal(updatedBoss.role, Role.BOSS); assert.ok(hasRole(updatedBoss, Role.CONTROLLER));
    assert.ok((await db.$transaction(tx => readLeadTask(tx, boss.token, otherTask)))?.manager);
    await assert.rejects(db.$transaction(tx => updateUserMutation(tx, boss.id, boss.token, boss.id, { name: "boss", role: Role.CONTROLLER, roles: [Role.CONTROLLER], branchId: branch.id })), /自己/);
    await assert.rejects(db.$transaction(tx => assertActiveBossInvariant(tx, updatedBoss, Role.CONTROLLER, "ACTIVE")));
    console.log("PASS: 多岗增撤、绑定保留、岗位筛选、并发修改、双工作台、跨直播间同时导粉、单中控直播限制、权限叠加与收回、老板保护");
  } finally {
    try { if (verified) {
      const ids = (await db.douyinAccount.findMany({ where: { douyinId: { startsWith: marker } }, select: { id: true } })).map(a => a.id);
      await db.leadTask.deleteMany({ where: { session: { accountId: { in: ids } } } });
      await db.liveReport.deleteMany({ where: { accountId: { in: ids } } });
      await db.workSession.deleteMany({ where: { accountId: { in: ids } } });
      await db.accountRecord.deleteMany({ where: { accountId: { in: ids } } });
      await db.douyinAccount.deleteMany({ where: { id: { in: ids } } });
      await cleanupRun(db, marker);
    } } finally { await db.$disconnect(); }
  }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(e => { console.error(e); process.exitCode = 1; });
