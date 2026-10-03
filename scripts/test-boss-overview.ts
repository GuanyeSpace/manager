import assert from "node:assert/strict";
import { validateTestEnv, resolveTestClient, assertTestDatabase, newRunId, cleanupRun } from "./lib/test-db";
import { readAccountList } from "../modules/accounts/data";
import { readBossIncome } from "../modules/settlements/service";
import type { Role } from "../app/generated/prisma/enums";

async function main() {
  const {dbName}=validateTestEnv(), db=resolveTestClient(), marker=newRunId();let verified=false;
  try {
    await assertTestDatabase(db,dbName);verified=true;
    const branch=await db.branch.create({data:{name:marker+"branch"}});
    async function user(name:string,role:Role) {
      const u=await db.user.create({data:{username:marker+name,name,role,branchId:branch.id,passwordHash:"not-real",mustChangePassword:false}});
      const token=marker+u.id;await db.session.create({data:{id:token,userId:u.id,expiresAt:new Date(Date.now()+3600000)}});return {...u,token};
    }
    const boss=await user("老板","BOSS"),controller=await user("中控甲","CONTROLLER"),other=await user("中控乙","CONTROLLER"),anchor=await user("主播甲","ANCHOR");
    const external=await db.externalAnchor.create({data:{name:anchor.name,branchId:branch.id}});
    const backend=await db.leadBackend.create({data:{name:marker+"backend",url:""}});
    const create=(name:string,data:object)=>db.douyinAccount.create({data:{name,douyinId:marker+name,branchId:branch.id,homepageUrl:"",realName:"",phone:"",purpose:"",notes:"",...data}});
    const active=await create("启用账号",{controllerId:controller.id,anchorId:anchor.id});
    const banned=await create("封禁账号",{controllerId:controller.id,externalAnchorId:external.id,banned:true,active:false});
    const inactive=await create("停用账号",{controllerId:other.id,active:false});
    const spare=await create("备用账号",{});
    const tx=<T>(fn:(t:Parameters<Parameters<typeof db.$transaction>[0]>[0])=>Promise<T>)=>db.$transaction(fn,{isolationLevel:"RepeatableRead"});
    const ids=(d:Awaited<ReturnType<typeof readAccountList>>)=>d.accounts.map(a=>a.id).sort();
    assert.deepEqual(ids(await tx(t=>readAccountList(t,boss.token,"",{controllerId:controller.id,anchorId:anchor.id,status:"active"}))),[active.id]);
    assert.deepEqual(ids(await tx(t=>readAccountList(t,boss.token,"",{anchorId:`external:${external.id}`,status:"banned"}))),[banned.id]);
    assert.deepEqual(ids(await tx(t=>readAccountList(t,boss.token,"停用",{status:"inactive"}))),[inactive.id]);
    assert.deepEqual(ids(await tx(t=>readAccountList(t,boss.token,"备用",{controllerId:"unassigned",anchorId:"unassigned"}))),[spare.id]);
    assert.equal((await tx(t=>readAccountList(t,boss.token,"",{anchorId:anchor.id,status:"banned"}))).accounts.length,0);
    const scoped=await tx(t=>readAccountList(t,controller.token));assert.deepEqual(ids(scoped),[active.id,banned.id].sort());assert(!scoped.controllers.some(p=>p.id===other.id));
    assert.equal((await tx(t=>readAccountList(t,controller.token,"",{controllerId:other.id}))).accounts.length,0);
    const searched=await tx(t=>readAccountList(t,boss.token,"启用"));assert(searched.anchors.some(p=>p.id===`external:${external.id}`));
    await db.confirmedLead.createMany({data:[
      {day:"2026-09-28",anchorId:anchor.id,anchorName:anchor.name,backendId:backend.id,backendName:backend.name,backendUrl:"",joinCount:10,effectiveCount:8,backendUnitCents:1234,anchorUnitCents:100},
      {day:"2026-09-28",externalAnchorId:external.id,anchorName:external.name,backendId:backend.id,backendName:backend.name,backendUrl:"",joinCount:5,effectiveCount:3,backendUnitCents:567,anchorUnitCents:10},
      {day:"2026-09-29",anchorId:anchor.id,anchorName:anchor.name,backendId:backend.id,backendName:backend.name,backendUrl:"",joinCount:99,effectiveCount:99,backendUnitCents:100,anchorUnitCents:10,deletedAt:new Date()},
    ]});
    const range={from:"2026-09-28",to:"2026-09-30"};
    assert.deepEqual((await tx(t=>readBossIncome(t,boss.token,range))).totals,{joins:15,effective:11,income:"115.73"});
    assert.equal((await tx(t=>readBossIncome(t,boss.token,{...range,anchorId:anchor.id}))).totals.income,"98.72");
    const externalIncome=await tx(t=>readBossIncome(t,boss.token,{...range,anchorId:`external:${external.id}`,group:"week"}));assert.equal(externalIncome.totals.income,"17.01");assert.equal(externalIncome.rows[0].period,"2026-09-28 ~ 2026-10-04");
    assert.equal((await tx(t=>readBossIncome(t,boss.token,{from:"2026-09-29",to:"2026-09-30"}))).rows.length,0);
    await assert.rejects(tx(t=>readBossIncome(t,controller.token,range)),/仅老板/);
    await db.session.delete({where:{id:other.token}});await assert.rejects(tx(t=>readAccountList(t,other.token)),/登录/);
    console.log("PASS: combined filters, banned precedence, unassigned, scoped options, same-name internal/external anchors, exact revenue, deleted/empty dates and boss-only access");
  } finally {
    if(verified){await db.confirmedLead.deleteMany({where:{backend:{name:{startsWith:marker}}}});await db.leadBackend.deleteMany({where:{name:{startsWith:marker}}});await db.douyinAccount.deleteMany({where:{douyinId:{startsWith:marker}}});await db.externalAnchor.deleteMany({where:{branch:{name:{startsWith:marker}}}});await cleanupRun(db,marker);}
    await db.$disconnect();
  }
}
main().then(()=>console.log("ALL PASS (including cleanup)")).catch(e=>{console.error(e);process.exitCode=1;});
