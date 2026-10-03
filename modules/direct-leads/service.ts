import { requireReadAccountActor } from "@/lib/auth/read-actor";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireAccountActor } from "@/modules/accounts/service";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { isLeadSpecialist, isReportOperator, canManageLiveReports, reportManagementScope } from "@/lib/auth/live-report-permissions";
import { isAccountBoss, type AccountActor } from "@/lib/auth/account-permissions";
import { roleWhere } from "@/lib/auth/roles";
import { writeAudit } from "@/lib/audit";
import { shanghaiDate, metricFields } from "@/modules/live-reports/schema";
import { audienceFields, audienceHundredths, parseDuration, powderFields } from "@/modules/live-reports/input-metrics";
import { leadCommandSchema, activeLeadFields, leadValues } from "@/modules/leads/schema";
export const directCreateSchema=z.object({accountId:z.string().min(1,"请选择账号"),externalAnchorId:z.string().min(1,"请选择外部主播"),startedAt:z.string().refine(v=>!!shanghaiDate(v),"请输入有效的实际开播时间"),label:z.string().trim().min(1,"请输入场次名称").max(30)});
export function directScope(actor:AccountActor):Prisma.DirectLeadTaskWhereInput {
 if(isAccountBoss(actor))return {};
 return {OR:[{branch:reportManagementScope(actor)},...(isLeadSpecialist(actor)?[{branchId:actor.branchId??"",userId:actor.id}]:[]),...(isReportOperator(actor)?[{branchId:actor.branchId??"",account:{operatorId:actor.id}}]:[])]};
}
export async function assertNoDirectDuplicate(tx:Prisma.TransactionClient,accountId:string,startedAt:Date,excludeId?:string){
 const start=new Date(Math.floor(startedAt.getTime()/60000)*60000),end=new Date(start.getTime()+60000);
 const task=await tx.directLeadTask.findFirst({where:{accountId,startedAt:{gte:start,lt:end},...(excludeId?{id:{not:excludeId}}:{})},select:{id:true}});
 if(task)throw new UserActionError("该账号在同一开播分钟已有直接填报记录，请继续原记录；在回收站的记录请联系负责人恢复");
}
async function assertNoExecutionDuplicate(tx:Prisma.TransactionClient,accountId:string,startedAt:Date,directId?:string){
 const start=new Date(Math.floor(startedAt.getTime()/60000)*60000),end=new Date(start.getTime()+60000),time={gte:start,lt:end};
 await assertNoDirectDuplicate(tx,accountId,startedAt,directId);
 if(await tx.workSession.findFirst({where:{accountId,startedAt:time},select:{id:true}})||await tx.liveReport.findFirst({where:{accountId,startedAt:time,...(directId?{OR:[{directTaskId:null},{directTaskId:{not:directId}}]}:{})},select:{id:true}}))throw new UserActionError("该账号在同一开播分钟已有场次或报表，请继续原记录");
}
export async function readDirectOptions(tx:Prisma.TransactionClient,token:string){
 const actor=await requireReadAccountActor(tx,token);if(!isLeadSpecialist(actor)||!actor.branchId)return {accounts:[],anchors:[]};
 const accounts=await tx.douyinAccount.findMany({where:{branchId:actor.branchId,branch:{status:"ACTIVE"},externalAnchor:{active:true}},select:{id:true,name:true,douyinId:true,externalAnchorId:true},orderBy:{name:"asc"}});
 const anchors=await tx.externalAnchor.findMany({where:{branchId:actor.branchId,active:true},select:{id:true,name:true},orderBy:{name:"asc"}});return {accounts,anchors};
}
export async function createDirectTask(tx:Prisma.TransactionClient,token:string,raw:unknown,ip:string){
 const v=directCreateSchema.parse(raw);await acquireUserMutationLock(tx);const actor=await requireAccountActor(tx,token);
 if(!isLeadSpecialist(actor)||!actor.branchId)throw new UserActionError("仅本分公司导粉专员可以直接录入");
 const startedAt=shanghaiDate(v.startedAt)!;if(startedAt.getTime()>Date.now())throw new UserActionError("开播时间不能晚于现在");
 const account=await tx.douyinAccount.findFirst({where:{id:v.accountId,branchId:actor.branchId,branch:{status:"ACTIVE"},externalAnchor:{active:true}}});
 const anchor=await tx.externalAnchor.findFirst({where:{id:v.externalAnchorId,branchId:actor.branchId,active:true}});
 if(!account||!anchor)throw new UserActionError("请选择本分公司外部主播账号及启用的外部主播");
 const records=await tx.accountRecord.findMany({where:{accountId:account.id,startedAt:{lte:startedAt},OR:[{endedAt:null},{endedAt:{gt:startedAt}}]}});
 if(records.length!==1||records[0].branchId!==actor.branchId||!records[0].externalAnchorId)throw new UserActionError("无法确定开播时的外部账号归属，请管理人员先处理账号历史资料");
 await assertNoExecutionDuplicate(tx,account.id,startedAt);
 const task=await tx.directLeadTask.create({data:{accountId:account.id,sourceRecordId:records[0].id,branchId:records[0].branchId,externalAnchorId:anchor.id,anchorName:anchor.name,userId:actor.id,userName:actor.name,startedAt,label:v.label}});
 await writeAudit({db:tx,actorId:actor.id,action:"LIVE_REPORT_CREATE",targetType:"DirectLeadTask",targetId:task.id,ip,detail:{command:"create",actorName:actor.name,accountId:account.id,sourceRecordId:records[0].id,externalAnchorId:anchor.id,anchorName:anchor.name,userId:actor.id,startedAt:startedAt.toISOString(),label:v.label}});return task.id;
}
export async function readDirectTask(tx:Prisma.TransactionClient,token:string,id:string){
 const actor=await requireReadAccountActor(tx,token),task=await tx.directLeadTask.findFirst({where:{AND:[directScope(actor),{id}]},include:{branch:true,sourceRecord:true,report:{select:{id:true}}}});if(!task)return null;
 const manager=canManageLiveReports(actor,task.branch),editable=manager||isLeadSpecialist(actor)&&task.userId===actor.id;
 const history=await tx.auditLog.findMany({where:{targetType:"DirectLeadTask",targetId:id},select:{id:true,createdAt:true,detail:true},orderBy:{createdAt:"desc"}});
 const people=manager?await tx.user.findMany({where:{employmentStatus:"ACTIVE",branchId:task.branchId,AND:[roleWhere("LEAD_SPECIALIST")]},select:{id:true,name:true},orderBy:{name:"asc"}}):[];
 return {task,manager,editable,history,people};
}
export async function runDirectCommand(tx:Prisma.TransactionClient,token:string,raw:unknown,ip:string){
 const v=leadCommandSchema.parse(raw);if(["claim","release","correctActual"].includes(v.command))throw new UserActionError("直接录入不支持此认领操作");await acquireUserMutationLock(tx);const actor=await requireAccountActor(tx,token);
 const detail=await readDirectTask(tx,token,v.id);if(!detail||!detail.editable)throw new UserActionError("记录不存在或无修改权限");
 const {task,manager}=detail;if(task.version!==v.version)throw new UserActionError("数据已被修改，请保留输入并刷新核对后重试");
 let update:Prisma.DirectLeadTaskUncheckedUpdateInput={version:{increment:1}};
 if(["delete","restore","correctOwner"].includes(v.command)){
  if(!manager||!v.reason)throw new UserActionError("仅老板或本分公司负责人可以操作，且须填写原因");
  if(v.command==="correctOwner"){
   if(task.deletedAt)throw new UserActionError("请先恢复记录");
   const person=await tx.user.findFirst({where:{id:v.userId,branchId:task.branchId,employmentStatus:"ACTIVE",AND:[roleWhere("LEAD_SPECIALIST")]}});if(!person||person.id===task.userId)throw new UserActionError("请选择本分公司另一名在职导粉专员");
   update={...update,userId:person.id,userName:person.name};await tx.liveReport.updateMany({where:{directTaskId:task.id},data:{leadUserId:person.id,leadUserName:person.name,updatedByName:actor.name,version:{increment:1}}});
  }else{
   const deleting=v.command==="delete";if(deleting===!!task.deletedAt)throw new UserActionError("记录状态已变化");if(!deleting)await assertNoExecutionDuplicate(tx,task.accountId,task.startedAt,task.id);
   const deletedAt=deleting?new Date():null;update.deletedAt=deletedAt;await tx.liveReport.updateMany({where:{directTaskId:task.id},data:{deletedAt,updatedByName:actor.name,version:{increment:1}}});
  }
 }else{
  if(v.command==="claim"||task.deletedAt||!v.data)throw new UserActionError("不能执行该操作，请检查记录和填写数据");
  if(task.completedAt&&!v.reason)throw new UserActionError("请填写更正原因");
  const values=v.data,old=leadValues(task.data),complete=v.command==="complete"||!!task.completedAt;
  if(values.leadMode==="no")for(const[key]of powderFields)if(!values[key])values[key]=old[key];
  for(const[key,label]of audienceFields)if(old[key]&&!values[key])throw new UserActionError(`${label}已有记录，不能清空`);
  if(old.leadMode&&!values.leadMode)throw new UserActionError("已确认是否导粉，不能清空选择");
  if(complete){
   const missing=activeLeadFields.filter(([key])=>!values[key]&&!(values.leadMode==="no"&&powderFields.some(([p])=>p===key)));if(missing.length)throw new UserActionError(`请补齐：${missing.map(([,label])=>label).join("、")}`);
   const durationSeconds=parseDuration(values.durationText)??0;if(!durationSeconds||task.startedAt.getTime()+durationSeconds*1000>Date.now())throw new UserActionError("请核对直播时长：须大于0，且结束时间不能晚于现在");
   await assertNoExecutionDuplicate(tx,task.accountId,task.startedAt,task.id);
   const metrics=Object.fromEntries([...metricFields,...(values.leadMode==="no"?[]:powderFields)].map(([key])=>[key,Number(values[key])])) as Record<typeof metricFields[number][0]|typeof powderFields[number][0],number>;
   const fields={...metrics,isLeadGeneration:values.leadMode==="yes",durationSeconds,averageStayHundredths:Math.round(Number(values.averageStayMinutes)*100),femaleHundredths:audienceHundredths(values.femalePercent),age31To40Hundredths:audienceHundredths(values.age31To40Percent),updatedByName:actor.name,monetizationUpdatedAt:new Date(),monetizationUpdatedBy:actor.name};
   await tx.liveReport.upsert({where:{directTaskId:task.id},update:{...fields,version:{increment:1}},create:{...fields,directTaskId:task.id,accountId:task.accountId,sourceRecordId:task.sourceRecordId,branchId:task.branchId,branchName:task.sourceRecord.branchName,accountName:task.sourceRecord.name,douyinId:task.sourceRecord.douyinId,operatorId:task.sourceRecord.operatorId,externalAnchorId:task.externalAnchorId,anchorName:task.anchorName,leadUserId:task.userId,leadUserName:task.userName,startedAt:task.startedAt,sessionLabel:task.label,createdById:actor.id,createdByName:actor.name}});
   if(!task.completedAt)update.completedAt=new Date();
  }
  update.data={...(task.data as Record<string,Prisma.InputJsonValue>),...Object.fromEntries(activeLeadFields.map(([key])=>[key,values[key]])),formVersion:2};
 }
 const after=await tx.directLeadTask.update({where:{id:task.id},data:update});
 await writeAudit({db:tx,actorId:actor.id,action:"LIVE_REPORT_UPDATE",targetType:"DirectLeadTask",targetId:task.id,ip,detail:JSON.parse(JSON.stringify({command:v.command,actorName:actor.name,reason:v.reason,before:task,after}))});return task.id;
}
