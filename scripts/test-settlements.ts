import assert from "node:assert/strict";
import {validateTestEnv,resolveTestClient,assertTestDatabase,newRunId,cleanupRun} from "./lib/test-db";
import {saveBackend,saveConfirmed,recycleConfirmed,readConfirmed,readAnchorIncome} from "../modules/settlements/service";
import {readComparison} from "../modules/settlements/comparison";
import {dateRange} from "../modules/live-reports/date-range";
import {moneyText,totalCents,period} from "../modules/settlements/schema";
import {saveAccount} from "../modules/accounts/service";
import {saveWorkflow,runWorkCommand} from "../modules/workbench/service";
import {correctSession} from "../modules/workbench/corrections";
import {correctReportPeople} from "../modules/live-reports/service";
import {readLiveReports} from "../modules/live-reports/data";
import {shanghaiInput,shanghaiDate} from "../modules/live-reports/schema";
import type {Role} from "../app/generated/prisma/enums";
async function main(){
 const {dbName}=validateTestEnv(),db=resolveTestClient(),marker=newRunId();let verified=false;
 try{
 await assertTestDatabase(db,dbName);verified=true;
 const a=await db.branch.create({data:{name:marker+"branch"}});
 async function user(name:string,role:Role){const u=await db.user.create({data:{username:marker+name,name,role,branchId:a.id,passwordHash:"not-real",mustChangePassword:false}});const token=marker+name;await db.session.create({data:{id:token,userId:u.id,expiresAt:new Date(Date.now()+3600000)}});return {...u,token};}
 const boss=await user("boss","BOSS"),anchor=await user("anchor","ANCHOR"),other=await user("other","ANCHOR"),control=await user("control","CONTROLLER"),lead=await user("lead","LEAD_SPECIALIST"),operator=await user("operator","OPERATOR"),manager=await user("manager","ASSISTANT");
 await db.branch.update({where:{id:a.id},data:{managerId:manager.id}});
 const tx=<T>(fn:(t:Parameters<Parameters<typeof db.$transaction>[0]>[0])=>Promise<T>)=>db.$transaction(fn);
 const backendRaw={id:"",version:0,name:marker+"backend",url:"https://example.com/backend",active:"true"};
 for(const u of [anchor,lead,control,operator,manager]){await assert.rejects(tx(t=>saveBackend(t,u.token,backendRaw,"test")),/仅老板/);await assert.rejects(tx(t=>readConfirmed(t,u.token,{})),/仅老板/);await assert.rejects(tx(t=>readComparison(t,u.token,{})),/仅老板/);}
 const b=await tx(t=>saveBackend(t,boss.token,backendRaw,"test")),b2=await tx(t=>saveBackend(t,boss.token,{...backendRaw,name:marker+"backend2"},"test"));
 const day=dateRange("yesterday")!.to,raw={id:"",version:0,day,anchorId:anchor.id,backendId:b,joinCount:"12",effectiveCount:"10",backendUnit:"12.35",anchorUnit:"2.56"};
 await assert.rejects(tx(t=>saveConfirmed(t,boss.token,{...raw,day:shanghaiInput(new Date()).slice(0,10)},"test")),/昨天/);
 await assert.rejects(tx(t=>saveConfirmed(t,boss.token,{...raw,effectiveCount:"13"},"test")),/有效数量/);
 await assert.rejects(tx(t=>saveConfirmed(t,boss.token,{...raw,anchorUnit:"1.234"},"test")),/单价/);
 const id=await tx(t=>saveConfirmed(t,boss.token,raw,"test"));await assert.rejects(tx(t=>saveConfirmed(t,boss.token,raw,"test")),/已有记录/);
 const id2=await tx(t=>saveConfirmed(t,boss.token,{...raw,backendId:b2,joinCount:"8",effectiveCount:"5",anchorUnit:"3.00"},"test"));
 await tx(t=>saveConfirmed(t,boss.token,{...raw,anchorId:other.id},"test"));
 const own=await tx(t=>readAnchorIncome(t,anchor.token,{from:day,to:day}));assert.deepEqual(own.totals,{joins:20,effective:15,income:"40.60"});assert.equal(own.rows.length,1);assert(!JSON.stringify(own).includes("backend"));assert(!JSON.stringify(own).includes(other.id));
 for(const group of ["week","month"]){const grouped=await tx(t=>readAnchorIncome(t,anchor.token,{from:day,to:day,group}));assert.equal(grouped.rows[0].income,"40.60");}
 assert.equal((await tx(t=>readAnchorIncome(t,other.token,{from:day,to:day}))).totals.income,"25.60");
 await assert.rejects(tx(t=>readAnchorIncome(t,lead.token,{})),/仅主播/);
 await tx(t=>saveBackend(t,boss.token,{...backendRaw,id:b,version:1,name:marker+"renamed",url:"https://example.com/new",reason:"改后端"},"test"));
 assert.equal((await db.confirmedLead.findUniqueOrThrow({where:{id}})).backendName,backendRaw.name);
 const edit={...raw,id,version:1,reason:"核对单价"};const race=await Promise.allSettled([tx(t=>saveConfirmed(t,boss.token,{...edit,anchorUnit:"2.57"},"test")),tx(t=>saveConfirmed(t,boss.token,{...edit,anchorUnit:"2.58"},"test"))]);assert.equal(race.filter(r=>r.status==="fulfilled").length,1);
 const row=await db.confirmedLead.findUniqueOrThrow({where:{id}});await assert.rejects(tx(t=>saveConfirmed(t,boss.token,{...edit,version:row.version,reason:""},"test")),/更正原因/);
 await assert.rejects(tx(async t=>{await saveConfirmed(t,boss.token,{...edit,version:row.version,joinCount:"99"},"test");throw Error("rollback");}),/rollback/);assert.equal((await db.confirmedLead.findUniqueOrThrow({where:{id}})).joinCount,12);
 await tx(t=>recycleConfirmed(t,boss.token,{id:id2,version:1,operation:"delete",reason:"误录"},"test"));assert.equal((await tx(t=>readAnchorIncome(t,anchor.token,{from:day,to:day}))).totals.joins,12);
 await assert.rejects(tx(t=>saveConfirmed(t,boss.token,{...raw,backendId:b2},"test")),/回收站/);
 await tx(t=>recycleConfirmed(t,boss.token,{id:id2,version:2,operation:"restore",reason:"恢复"},"test"));
 assert.equal((await tx(t=>readAnchorIncome(t,anchor.token,{from:day,to:day}))).totals.joins,20);
 const account=await tx(t=>saveAccount(t,boss.token,{id:"",version:0,douyinId:marker+"account",name:"统计账号",homepageUrl:"",realName:"",phone:"",purpose:"",notes:"",branchId:a.id,operatorId:operator.id,controllerId:control.id,anchorId:anchor.id,active:"true"},"test"));
 await tx(t=>saveWorkflow(t,boss.token,account,0,{before:[],live:[],after:[],scripts:[],materials:""},"test"));
 await db.workShift.create({data:{userId:boss.id,userName:boss.name,startedAt:new Date(Date.now()-3600000),checks:{sound:{status:"normal"},picture:{status:"normal"},network:{status:"normal"}}}});
 const session=await tx(t=>runWorkCommand(t,boss.token,{id:account,version:0,command:"create",actualAnchorId:other.id},"test"));
 let work=await db.workSession.findUniqueOrThrow({where:{id:session}});assert.equal(work.actualAnchorId,other.id);
 await db.workSession.update({where:{id:session},data:{actualAnchorId:null,actualAnchorName:null}});
 const source=await db.accountRecord.findFirstOrThrow({where:{accountId:account}});
 await db.accountRecord.update({where:{id:source.id},data:{anchorId:null,anchorName:null}});
 await assert.rejects(tx(t=>runWorkCommand(t,boss.token,{id:session,version:work.version,command:"start",time:shanghaiInput(new Date())},"test")),/本场实际主播/);
 await tx(t=>runWorkCommand(t,boss.token,{id:session,version:work.version,command:"anchor",actualAnchorId:other.id},"test"));
 await tx(t=>runWorkCommand(t,boss.token,{id:session,version:work.version+1,command:"start",time:shanghaiInput(new Date())},"test"));
 await assert.rejects(tx(t=>runWorkCommand(t,boss.token,{id:session,version:work.version+2,command:"anchor",actualAnchorId:anchor.id},"test")),/锁定/);
 await db.workSession.update({where:{id:session},data:{phase:"COMPLETE",startedAt:shanghaiDate(day+"T23:50")!,endedAt:new Date(+shanghaiDate(day+"T23:50")!+20*60000),actualControllerId:boss.id,actualControllerName:boss.name}});
 await db.leadTask.create({data:{sessionId:session,branchId:a.id,userId:lead.id,userName:lead.name,completedAt:new Date()}});
 const report=await db.liveReport.create({data:{accountId:account,sourceRecordId:source.id,branchId:a.id,branchName:a.name,accountName:"统计账号",douyinId:marker,controllerId:control.id,controllerName:control.name,anchorId:anchor.id,createdById:boss.id,createdByName:boss.name,updatedByName:boss.name,workSessionId:session,startedAt:shanghaiDate(day+"T23:50")!,sessionLabel:"跨日",durationSeconds:1200,exposureCount:100,entryCount:50,averageOnline:10,peakOnline:20,averageStayHundredths:100,commenterCount:2,likeCount:10,newFollowers:2,shareCount:1,newFanClubMembers:1,backendJoinCount:12,effectiveCount:9}});
 const filter={accountId:account,anchorId:other.id,controllerId:boss.id,leadId:lead.id,from:day,to:day,page:1};let reports=await tx(t=>readLiveReports(t,boss.token,filter));assert.equal(reports.count,1);assert.equal(reports.reports[0].anchorName,other.name);assert.equal(reports.reports[0].controllerName,boss.name);assert.equal(reports.summary.effective,9);
 assert.equal((await tx(t=>readLiveReports(t,boss.token,{...filter,controllerId:control.id}))).count,0);
 assert.equal((await tx(t=>readLiveReports(t,control.token,filter))).count,0);
 let comparison=await tx(t=>readComparison(t,boss.token,{from:day,to:day,anchorId:other.id}));assert.equal(comparison.rows[0].reportCount,1);assert.equal(comparison.rows[0].confirmedEffective-comparison.rows[0].reportEffective,1);
 work=await db.workSession.findUniqueOrThrow({where:{id:session}});
 await assert.rejects(tx(t=>correctSession(t,control.token,{id:session,version:work.version,kind:"anchor",actualAnchorId:anchor.id,reason:"更正"},"test")),/权限|仅老板/);
 await tx(t=>correctSession(t,boss.token,{id:session,version:work.version,kind:"anchor",actualAnchorId:anchor.id,reason:"主播选错"},"test"));
 reports=await tx(t=>readLiveReports(t,boss.token,{...filter,anchorId:anchor.id}));assert.equal(reports.count,1);
 comparison=await tx(t=>readComparison(t,boss.token,{from:day,to:day,anchorId:anchor.id}));assert.equal(comparison.rows[0].confirmedJoins-comparison.rows[0].reportJoins,8);
 await db.leadTask.update({where:{sessionId:session},data:{completedAt:null}});comparison=await tx(t=>readComparison(t,boss.token,{from:day,to:day,anchorId:anchor.id}));assert.equal(comparison.rows[0].pending,1);assert.equal(comparison.rows[0].reportCount,0);
 // Independent legacy record: personnel correction preserves metrics and is audited.
 const {id:_,createdAt:__,updatedAt:___,...copy}=report;void _;void __;void ___;
 const old=await db.liveReport.create({data:{...copy,workSessionId:null,startedAt:shanghaiDate(day+"T20:00")!}});
 await tx(t=>correctReportPeople(t,boss.token,{id:old.id,version:old.version,anchorId:other.id,controllerId:boss.id,leadUserId:lead.id,reason:"补历史人员"},"test"));assert.equal((await db.liveReport.findUniqueOrThrow({where:{id:old.id}})).effectiveCount,9);
 const legacy=await tx(t=>readLiveReports(t,boss.token,filter));assert.equal(legacy.count,1);assert.equal(legacy.reports[0].anchorName,other.name);
 // More than one page: totals must include all rows, including explicit zeros.
 for(let i=0;i<31;i++)await db.liveReport.create({data:{...copy,workSessionId:null,startedAt:new Date(+shanghaiDate(day+"T01:00")!+i*60000),anchorId:other.id,anchorName:other.name,controllerId:boss.id,controllerName:boss.name,leadUserId:lead.id,leadUserName:lead.name}});
 reports=await tx(t=>readLiveReports(t,boss.token,filter));assert.equal(reports.count,32);assert.equal(reports.reports.length,30);assert.equal(reports.summary.joins,32*12);
 await db.session.delete({where:{id:boss.token}});await assert.rejects(tx(t=>readConfirmed(t,boss.token,{})),/登录/);
 assert.deepEqual(dateRange("month",new Date("2026-10-01T04:00:00Z")),{from:"2026-10-01",to:"2026-09-30"});assert.deepEqual(dateRange("lastMonth",new Date("2026-03-01T00:00:00Z")),{from:"2026-02-01",to:"2026-02-28"});assert.deepEqual(dateRange("7d",new Date("2026-10-02T00:00:00Z")),{from:"2026-09-25",to:"2026-10-01"});assert.equal(period("2026-10-04","week"),"2026-09-28 ~ 2026-10-04");assert.equal(moneyText(totalCents(2000000000,999999999)),"19999999980000000.00");
 console.log("PASS: settlement permissions, cents, multiple backends, snapshots, versions, audit rollback, recycle, anchor DTO, periods, actual staff, start guard, corrections, cross-midnight, report filters/all-page sums and comparison");
 }finally{if(verified){const accounts=await db.douyinAccount.findMany({where:{douyinId:{startsWith:marker}},select:{id:true}}),ids=accounts.map(a=>a.id);await db.confirmedLead.deleteMany({where:{anchor:{username:{startsWith:marker}}}});await db.leadBackend.deleteMany({where:{name:{startsWith:marker}}});await db.leadTask.deleteMany({where:{session:{accountId:{in:ids}}}});await db.liveReport.deleteMany({where:{accountId:{in:ids}}});await db.workEvent.deleteMany({where:{session:{accountId:{in:ids}}}});await db.workSession.deleteMany({where:{accountId:{in:ids}}});await db.workShift.deleteMany({where:{userId:{in:(await db.user.findMany({where:{username:{startsWith:marker}},select:{id:true}})).map(u=>u.id)}}});await db.accountWorkflow.deleteMany({where:{accountId:{in:ids}}});await db.accountRecord.deleteMany({where:{accountId:{in:ids}}});await db.douyinAccount.deleteMany({where:{id:{in:ids}}});await db.branch.updateMany({where:{name:{startsWith:marker}},data:{managerId:null}});await cleanupRun(db,marker);}await db.$disconnect();}
}
main().then(()=>console.log("ALL PASS (including cleanup)")).catch(e=>{console.error(e);process.exitCode=1});
