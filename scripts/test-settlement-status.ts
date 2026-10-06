import assert from "node:assert/strict";
import {validateTestEnv,resolveTestClient,assertTestDatabase,newRunId,cleanupRun} from "./lib/test-db";
import {saveConfirmed,changeSettlementStatus,recycleConfirmed,readConfirmed,readBossIncome,readAnchorIncome} from "../modules/settlements/service";
import {previewReadToken} from "../lib/auth/read-actor";
async function main(){const {dbName}=validateTestEnv(),db=resolveTestClient(),marker=newRunId();let verified=false;
try{await assertTestDatabase(db,dbName);verified=true;
async function user(role:"BOSS"|"ANCHOR"){const u=await db.user.create({data:{username:marker+role,name:role,role,passwordHash:"test",mustChangePassword:false}});await db.session.create({data:{id:marker+role,userId:u.id,expiresAt:new Date(Date.now()+3600000)}});return {...u,token:marker+role};}
const boss=await user("BOSS"),anchor=await user("ANCHOR");const backends:{id:string}[]=[];for(let i=0;i<3;i++)backends.push(await db.leadBackend.create({data:{name:marker+i,url:"legacy"}}));
const tx=<T>(fn:(t:Parameters<Parameters<typeof db.$transaction>[0]>[0])=>Promise<T>)=>db.$transaction(fn);
const raw={id:"",version:0,day:"2026-09-30",anchorId:anchor.id,backendId:backends[0].id,joinCount:"12",effectiveCount:"10",backendUnit:"12.35",anchorUnit:"2.56"};
const id=await tx(t=>saveConfirmed(t,boss.token,raw,"test")),id2=await tx(t=>saveConfirmed(t,boss.token,{...raw,backendId:backends[1].id},"test"));
const legacy=await db.confirmedLead.create({data:{day:raw.day,anchorId:anchor.id,anchorName:anchor.name,backendId:backends[2].id,backendName:"old",backendUrl:"old",joinCount:5,effectiveCount:3,backendUnitCents:100,anchorUnitCents:50}});
assert.equal(legacy.isSettled,null);assert.equal((await db.confirmedLead.findUniqueOrThrow({where:{id}})).isSettled,false);
const cmd={operation:"settle",records:[{id,version:1},{id:id2,version:1}]};
for(const token of [anchor.token,previewReadToken(boss.token,"anchor",anchor.id),"expired"]){await assert.rejects(tx(t=>changeSettlementStatus(t,token,cmd,"test")));}
await assert.rejects(tx(t=>changeSettlementStatus(t,boss.token,{...cmd,records:[{id,version:1},{id:id2,version:99}]},"test")),/本次未保存/);
assert.equal((await db.confirmedLead.findUniqueOrThrow({where:{id}})).version,1);
await tx(t=>changeSettlementStatus(t,boss.token,cmd,"test"));
const paid=await db.confirmedLead.findUniqueOrThrow({where:{id}});assert.equal(paid.isSettled,true);assert.equal(paid.settledById,boss.id);assert(paid.settledAt);
await assert.rejects(tx(t=>saveConfirmed(t,boss.token,{...raw,id,version:paid.version,reason:"编辑"},"test")),/撤销结算/);
await assert.rejects(tx(t=>recycleConfirmed(t,boss.token,{id,version:paid.version,operation:"delete",reason:"删"},"test")),/撤销结算/);
const filter={from:raw.day,to:raw.day,anchorId:anchor.id};let summary=await tx(t=>readBossIncome(t,boss.token,filter));assert.equal(summary.settlementTotals.all.income,"250.00");assert.equal(summary.settlementTotals.paid.income,"247.00");assert.equal(summary.settlementTotals.unknown.income,"3.00");assert.equal(summary.settlementTotals.unpaid.income,"0.00");assert.equal(summary.settlementTotals.paid.effective,20);
assert.equal((await tx(t=>readConfirmed(t,boss.token,{...filter,status:"paid"}))).count,2);assert.equal((await tx(t=>readConfirmed(t,boss.token,{...filter,status:"unknown"}))).count,1);
const anchorBefore=await tx(t=>readAnchorIncome(t,anchor.token,filter));
const undo={operation:"unsettle",records:[{id,version:2}],reason:"误标"};await assert.rejects(tx(t=>changeSettlementStatus(t,boss.token,{...undo,reason:""},"test")),/撤销结算原因/);
await tx(t=>changeSettlementStatus(t,boss.token,undo,"test"));assert.deepEqual(await tx(t=>readAnchorIncome(t,anchor.token,filter)),anchorBefore);
await assert.rejects(tx(t=>changeSettlementStatus(t,boss.token,cmd,"test")),/已变化/);
await tx(t=>changeSettlementStatus(t,boss.token,{operation:"confirmUnpaid",records:[{id:legacy.id,version:1}]},"test"));
const race=await Promise.allSettled([tx(t=>changeSettlementStatus(t,boss.token,{operation:"settle",records:[{id,version:3}]},"test")),tx(t=>saveConfirmed(t,boss.token,{...raw,id,version:3,reason:"race"},"test"))]);assert.equal(race.filter(r=>r.status==="fulfilled").length,1);
let latest=await db.confirmedLead.findUniqueOrThrow({where:{id}});if(latest.isSettled){await tx(t=>changeSettlementStatus(t,boss.token,{operation:"unsettle",records:[{id,version:latest.version}],reason:"撤销测试"},"test"));latest=await db.confirmedLead.findUniqueOrThrow({where:{id}});}
await tx(t=>recycleConfirmed(t,boss.token,{id,version:latest.version,operation:"delete",reason:"回收"},"test"));await assert.rejects(tx(t=>changeSettlementStatus(t,boss.token,{operation:"settle",records:[{id,version:latest.version+1}]},"test")),/已删除/);
await tx(t=>recycleConfirmed(t,boss.token,{id,version:latest.version+1,operation:"restore",reason:"恢复"},"test"));assert.equal((await db.confirmedLead.findUniqueOrThrow({where:{id}})).isSettled,false);
const history=await db.auditLog.findMany({where:{targetType:"ConfirmedLead",targetId:id}});assert(history.some(h=>(h.detail as {operation?:string}).operation==="unsettle"));
summary=await tx(t=>readBossIncome(t,boss.token,filter));assert.equal(summary.settlementTotals.unknown.count,0);assert.equal(summary.settlementTotals.unpaid.income,"126.50");
assert.equal((await tx(t=>readBossIncome(t,boss.token,{...filter,from:"2020-01-01",to:"2020-01-02"}))).settlementTotals.all.count,0);
console.log("PASS settlement state, atomic batch, stale/race, paid locks, revoke reason, legacy, recycle, permissions, preview, precise totals and anchor invariance");
}finally{if(verified){await db.confirmedLead.deleteMany({where:{backend:{name:{startsWith:marker}}}});await db.leadBackend.deleteMany({where:{name:{startsWith:marker}}});await cleanupRun(db,marker);}await db.$disconnect();}}
main().then(()=>console.log("ALL PASS including cleanup")).catch(e=>{console.error(e);process.exitCode=1});
