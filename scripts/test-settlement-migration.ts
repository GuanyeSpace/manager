import "dotenv/config";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { validateTestEnv } from "./lib/test-db";

async function main() {
  const { url } = validateTestEnv();
  const base = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(base.hostname)) throw Error("迁移演练仅允许本机隔离库");
  const name = `manager_settlement_upgrade_${Date.now()}_test`;
  const adminUrl = new URL(base); adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  let client: pg.Client | undefined, created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`); created = true;
    base.pathname = `/${name}`; client = new pg.Client({ connectionString: base.toString() }); await client.connect();
    const folders = (await readdir("prisma/migrations")).filter(n => /^\d/.test(n)).sort();
    const current = folders.find(n => n.endsWith("_confirmed_leads"))!;
    for (const folder of folders.filter(n => n < current)) await client.query(await readFile(`prisma/migrations/${folder}/migration.sql`, "utf8"));
    await client.query(`INSERT INTO "Branch" (id,name) VALUES ('branch','旧分公司');
      INSERT INTO "User" (id,username,name,"passwordHash",role,"updatedAt") VALUES ('user','migration_user','旧员工','not-a-password','CONTROLLER',now());
      INSERT INTO "DouyinAccount" (id,"douyinId",name,"homepageUrl","realName",phone,purpose,notes,"branchId","controllerId","updatedAt") VALUES ('account','old_douyin','旧账号','','','','','','branch','user',now());
      INSERT INTO "AccountRecord" (id,"accountId","branchId","branchName","douyinId",name,active,"controllerId","controllerName","actorName",version) VALUES ('record','account','branch','旧分公司','old_douyin','旧账号',true,'user','旧员工','旧员工',1);
      INSERT INTO "WorkSession" (id,"accountId","sourceRecordId","controllerId",label,workflow,"workflowVersion","updatedAt",phase,"startedAt","endedAt") VALUES ('old','account','record','user','旧场次','{}',1,now(),'COMPLETE',now()-interval '2 hours',now()-interval '1 hour');
      INSERT INTO "LiveReport" (id,"accountId","sourceRecordId","branchId","branchName","accountName","douyinId","controllerId","controllerName","createdById","createdByName","updatedByName","startedAt","durationSeconds","sessionLabel","exposureCount","entryCount","averageOnline","peakOnline","averageStayHundredths","commenterCount","likeCount","newFollowers","shareCount","newFanClubMembers","updatedAt","hasSales","salesGmv") VALUES ('report','account','record','branch','旧分公司','旧账号','old_douyin','user','旧员工','user','旧员工','旧员工',now()-interval '2 hours',3600,'旧场',43000,4647,249,471,290,162,4980,290,13,27,now(),true,432.10);`);
    await client.query(`INSERT INTO "AssetDevice" (id,kind,code,model,"branchId","updatedAt") VALUES ('phone','PHONE','P-OLD','旧手机','branch',now())`);
    await client.query(`INSERT INTO "WorkShift" (id,"userId","userName","startedAt","endedAt",checks,"updatedAt") VALUES ('shift','user','旧员工',now()-interval '1 day',now()-interval '12 hours','{"sound":{"status":"issue","note":"旧异常","at":"2026-09-30T00:00:00Z","actor":"旧员工"}}',now())`);
    const tables = await client.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
    const saved = [];
    for (const { table_name: table } of tables.rows) {
      const columns = (await client.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table])).rows.map(c => `"${c.column_name}"`).join(",");
      const sql = `SELECT row_to_json(t)::text AS value FROM (SELECT ${columns} FROM "${table}") t ORDER BY row_to_json(t)::text`;
      saved.push({ table, sql, rows: (await client.query(sql)).rows });
    }
    for (const folder of folders.filter(n => n >= current)) await client.query(await readFile(`prisma/migrations/${folder}/migration.sql`, "utf8"));
    for (const item of saved) assert.deepEqual((await client.query(item.sql)).rows, item.rows, item.table);
    assert.deepEqual((await client.query(`SELECT "femaleHundredths", "age31To40Hundredths" FROM "LiveReport" WHERE id='report'`)).rows[0], { femaleHundredths: null, age31To40Hundredths: null });
    assert.deepEqual((await client.query(`SELECT "actualAnchorId", "actualAnchorName" FROM "WorkSession" WHERE id='old'`)).rows[0], {actualAnchorId:null,actualAnchorName:null});
    assert.equal((await client.query(`SELECT count(*)::int AS count FROM "ConfirmedLead"`)).rows[0].count,0);
    assert.equal((await client.query(`SELECT count(*)::int AS count FROM "LeadBackend"`)).rows[0].count,0);
    assert.deepEqual((await client.query(`SELECT "anchorName", "leadUserId", "leadUserName" FROM "LiveReport" WHERE id='report'`)).rows[0], {anchorName:null,leadUserId:null,leadUserName:null});

    console.log(`PASS: settlement migration preserved all original columns in ${saved.length} tables; new snapshots null and settlement tables empty`);

  } finally {
    await client?.end();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
}
main().then(() => console.log("ALL PASS (including cleanup)")).catch(e => { console.error(e); process.exitCode = 1; });
