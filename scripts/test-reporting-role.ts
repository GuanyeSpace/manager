import { writeFileSync } from "node:fs";
import { signSessionToken } from "../lib/auth/session-token";
import assert from "node:assert/strict";
import { validateTestEnv,resolveTestClient,assertTestDatabase,newRunId,cleanupRun } from "./lib/test-db";
import { saveAccount } from "../modules/accounts/service";
import { saveWorkflow,runWorkCommand } from "../modules/workbench/service";
import { defaultWorkflow } from "../modules/workbench/schema";
import { saveReportingSetting,readReportingSetting,saveSessionLiveData,readSessionLiveData } from "../modules/reporting/service";
import { runLeadCommand,readLeadList } from "../modules/leads/service";
import { leadValues } from "../modules/leads/schema";
import { readComparison } from "../modules/settlements/comparison";
import { recycleLiveReport } from "../modules/live-reports/recycle-service";
import type { Role } from "../app/generated/prisma/enums";
async function main(){
 if(process.env.CLEAN_REPORTING_MARKER&&!/^test-[a-z0-9]+-[a-f0-9]{8}$/.test(process.env.CLEAN_REPORTING_MARKER))throw Error("invalid cleanup marker");
 const {dbName}=validateTestEnv(),db=resolveTestClient(),marker=process.env.CLEAN_REPORTING_MARKER??newRunId();let verified=false;
 let original:Awaited<ReturnType<typeof db.reportingSetting.findUnique>>=null;
 try{
 await assertTestDatabase(db,dbName);verified=true;original=await db.reportingSetting.findUnique({where:{id:"company"}});if(process.env.CLEAN_REPORTING_MARKER)return;
 const branch=await db.branch.create({data:{name:marker}});
 async function user(name:string,role:Role){const u=await db.user.create({data:{username:marker+name,name,role,branchId:branch.id,passwordHash:"test-only",mustChangePassword:false}});const token=marker+name;await db.session.create({data:{id:token,userId:u.id,expiresAt:new Date(Date.now()+3600000)}});return{...u,token};}
 const boss=await user("boss","BOSS"),ctrl=await user("ctrl","CONTROLLER"),other=await user("other","CONTROLLER"),lead=await user("lead","LEAD_SPECIALIST"),operator=await user("operator","OPERATOR");
 const account=await db.$transaction(tx=>saveAccount(tx,boss.token,{id:"",version:0,douyinId:marker,name:"填写岗位测试",homepageUrl:"",realName:"",phone:"",purpose:"",notes:"",branchId:branch.id,controllerId:ctrl.id,operatorId:operator.id,anchorId:boss.id,active:"true"},"test"));
 await db.$transaction(tx=>saveWorkflow(tx,boss.token,account,0,{...defaultWorkflow,before:[],after:[]},"test"));
 await db.workShift.create({data:{userId:ctrl.id,userName:ctrl.name,startedAt:new Date(),checks:{}}});
 const setting=(token:string,role:string,version:number)=>db.$transaction(tx=>saveReportingSetting(tx,token,{role,version},"test"));
 const work=(token:string,input:object)=>db.$transaction(tx=>runWorkCommand(tx,token,input,"test"));
 const live=(token:string,input:object)=>db.$transaction(tx=>saveSessionLiveData(tx,token,input,"test"));
 const powder=(input:object,token=lead.token)=>db.$transaction(tx=>runLeadCommand(tx,token,input,"test"));
 const current=await db.$transaction(tx=>readReportingSetting(tx,boss.token));
 await assert.rejects(setting(ctrl.token,"CONTROLLER",current.version),/仅老板/);
 await assert.rejects(db.$transaction(tx=>readReportingSetting(tx,lead.token)),/仅老板/);
 let v=await setting(boss.token,"LEAD_SPECIALIST",current.version);
 const old=await work(ctrl.token,{command:"create",id:account,version:0});
 assert.equal((await db.workSession.findUniqueOrThrow({where:{id:old}})).liveDataRole,"LEAD_SPECIALIST");
 await db.workSession.update({where:{id:old},data:{phase:"CANCELLED",leadEligible:false}});
 v=await setting(boss.token,"CONTROLLER",v);
 await assert.rejects(setting(boss.token,"LEAD_SPECIALIST",v-1),/设置已更新/);
 const id=await work(ctrl.token,{command:"create",id:account,version:0});
 await setting(boss.token,"LEAD_SPECIALIST",v);
 assert.equal((await db.workSession.findUniqueOrThrow({where:{id}})).liveDataRole,"CONTROLLER");
 const input={id,version:0,command:"complete",data:{...leadValues({}),durationText:"10分钟",exposureCount:"1000",entryCount:"100",averageOnline:"20",peakOnline:"30",commenterCount:"3",likeCount:"40",newFollowers:"5",shareCount:"2",newFanClubMembers:"1",averageStayMinutes:"2.50",femalePercent:"65.32%",age31To40Percent:"50"}};
 await assert.rejects(live(ctrl.token,input),/下播后/);
 await db.workSession.update({where:{id},data:{phase:"WRAP",startedAt:new Date(Date.now()-3600000),endedAt:new Date(Date.now()-3000000)}});
 await assert.rejects(work(ctrl.token,{id,version:1,command:"complete",incident:"no"}),/提交完整/);
 await assert.rejects(live(other.token,input),/无填写权限/);await assert.rejects(live(lead.token,input),/无填写权限/);await assert.rejects(live("expired",input));
 const leadId=await powder({id,version:0,command:"claim"});
 const counts={...leadValues({}),leadMode:"yes",fanGroupCount:"10",linkClickCount:"8",backendJoinCount:"5",effectiveCount:"4"};
 await powder({id:leadId,version:1,command:"save",data:counts});
 await assert.rejects(powder({id:leadId,version:2,command:"complete",data:counts}),/等待直播中控/);
 await assert.rejects(live(ctrl.token,{...input,data:{...input.data,femalePercent:""}}),/请补齐/);
 const results=await Promise.allSettled([live(ctrl.token,input),live(ctrl.token,input)]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
 let report=await db.liveReport.findUniqueOrThrow({where:{workSessionId:id}});assert.equal(report.entryCount,100);assert.equal(report.backendJoinCount,null);
 const safe=await db.$transaction(tx=>readSessionLiveData(tx,ctrl.token,id));assert(safe);assert(!JSON.stringify(safe).includes("backendJoinCount"));
 await powder({id:leadId,version:2,command:"complete",data:{...counts,entryCount:"999"}});
 report=await db.liveReport.findUniqueOrThrow({where:{workSessionId:id}});assert.equal(report.entryCount,100);assert.equal(report.backendJoinCount,5);
 await assert.rejects(live(ctrl.token,{...input,version:1}),/更正原因/);
 await live(ctrl.token,{...input,version:1,reason:"核对人数",data:{...input.data,entryCount:"200",backendJoinCount:"900"}});
 report=await db.liveReport.findUniqueOrThrow({where:{workSessionId:id}});assert.equal(report.entryCount,200);assert.equal(report.backendJoinCount,5);
 await powder({id:leadId,version:3,command:"save",reason:"修正加人",data:{...counts,backendJoinCount:"6",entryCount:"100"}});
 report=await db.liveReport.findUniqueOrThrow({where:{workSessionId:id}});assert.equal(report.entryCount,200);assert.equal(report.backendJoinCount,6);
 await work(ctrl.token,{id,version:1,command:"complete",incident:"no"});
 await powder({id:leadId,version:4,command:"delete",reason:"测试回收"},boss.token);
 report=await db.liveReport.findUniqueOrThrow({where:{workSessionId:id}});assert.equal(report.deletedAt,null);assert(report.monetizationDeletedAt);
 await powder({id:leadId,version:5,command:"restore",reason:"恢复"},boss.token);
 await powder({id:leadId,version:6,command:"save",reason:"本场不导粉",data:{...counts,leadMode:"no"}});
 report=await db.liveReport.findUniqueOrThrow({where:{workSessionId:id}});assert.equal(report.isLeadGeneration,false);assert.equal(report.backendJoinCount,6);
 const comparison=await db.$transaction(tx=>readComparison(tx,boss.token,{from:"2020-01-01",to:"2099-01-01"}));assert(!comparison.rows.some(r=>r.anchorId===boss.id&&r.reportCount));
 // Controller-first: report exists before any claim; must still be claimable.
 const second=await db.workSession.create({data:{accountId:account,sourceRecordId:report.sourceRecordId,controllerId:ctrl.id,phase:"WRAP",label:"先直播数据",workflow:{...defaultWorkflow,before:[],after:[]},workflowVersion:1,liveDataRole:"CONTROLLER",startedAt:new Date(Date.now()-7200000),endedAt:new Date(Date.now()-6600000)}});
 await live(ctrl.token,{...input,id:second.id});
 assert((await db.$transaction(tx=>readLeadList(tx,lead.token,"available"))).sessions.some(s=>s.id===second.id));
 const secondLead=await powder({id:second.id,version:0,command:"claim"});
 await powder({id:secondLead,version:1,command:"complete",data:{...counts,leadMode:"no"}});
 await powder({id:secondLead,version:2,command:"delete",reason:"回收"},boss.token);
 const secondReport=await db.liveReport.findUniqueOrThrow({where:{workSessionId:second.id}});
 await db.$transaction(tx=>recycleLiveReport(tx,boss.token,{id:secondReport.id,version:secondReport.version,section:"report",operation:"delete",confirmed:"yes",reason:"回收"},"test"));
 await assert.rejects(powder({id:secondLead,version:3,command:"restore",reason:"恢复"},boss.token),/先恢复本场直播/);
 assert(await db.auditLog.count({where:{targetType:"SessionLiveData",targetId:id}})>=2);
 if(process.env.KEEP_REPORTING_UI){
 const third=await db.workSession.create({data:{accountId:account,sourceRecordId:report.sourceRecordId,controllerId:ctrl.id,actualControllerId:ctrl.id,actualControllerName:ctrl.name,loginUserId:ctrl.id,loginUserName:ctrl.name,actualAnchorId:boss.id,actualAnchorName:boss.name,phase:"WRAP",label:"浏览器填写",workflow:{...defaultWorkflow,before:[],after:[]},workflowVersion:1,liveDataRole:"CONTROLLER",startedAt:new Date(Date.now()-10800000),endedAt:new Date(Date.now()-10200000)}});
 const reminder=await db.workSession.create({data:{accountId:account,sourceRecordId:report.sourceRecordId,controllerId:ctrl.id,actualControllerId:ctrl.id,phase:"LIVE",label:"提醒验收",workflow:{...defaultWorkflow,live:[{detail:"按账号流程执行",title:"90秒红包提醒",minute:1,second:30,trigger:"timed"},{detail:"按账号流程执行",title:"90秒同时提醒",minute:1,second:30,trigger:"timed"},{detail:"按主播口令",title:"口令不自动提醒",minute:0,trigger:"manual"}]},workflowVersion:1,startedAt:new Date(Date.now()-85000)}});
 const anchor=await user("anchor","ANCHOR");
 writeFileSync("/tmp/manager-d056-fixture.json",JSON.stringify({marker,bossCookie:signSessionToken(boss.token),controllerCookie:signSessionToken(ctrl.token),leadCookie:signSessionToken(lead.token),controllerId:ctrl.id,leadId:lead.id,anchorId:anchor.id,sessionId:third.id,reminderId:reminder.id,leadTaskId:leadId,values:input.data}),{mode:0o600});
 }
 console.log("PASS: role snapshots, split write ownership, both save orders, wrap gate, validation, concurrency, audit, no-lead and independent recycle");
 }finally{if(verified&&!process.env.KEEP_REPORTING_UI){const accounts=await db.douyinAccount.findMany({where:{douyinId:{startsWith:marker}},select:{id:true}});const ids=accounts.map(a=>a.id);await db.leadTask.deleteMany({where:{session:{accountId:{in:ids}}}});await db.liveReport.deleteMany({where:{accountId:{in:ids}}});await db.workEvent.deleteMany({where:{session:{accountId:{in:ids}}}});await db.workSession.deleteMany({where:{accountId:{in:ids}}});await db.workShift.deleteMany({where:{userId:{in:(await db.user.findMany({where:{username:{startsWith:marker}},select:{id:true}})).map(u=>u.id)}}});await db.accountWorkflow.deleteMany({where:{accountId:{in:ids}}});await db.accountRecord.deleteMany({where:{accountId:{in:ids}}});await db.douyinAccount.deleteMany({where:{id:{in:ids}}});await db.reportingSetting.deleteMany({where:{id:"company"}});if(original)await db.reportingSetting.create({data:original});await cleanupRun(db,marker);}await db.$disconnect();}
}
main().then(()=>console.log(process.env.KEEP_REPORTING_UI?"PASS; browser fixtures retained":"ALL PASS including cleanup")).catch(e=>{console.error(e);process.exitCode=1;});
