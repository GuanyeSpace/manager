import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireAccountActor, historicalAccountScope } from "@/modules/accounts/service";
import { requireReadAccountActor } from "@/lib/auth/read-actor";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import { canManageLiveReports } from "@/lib/auth/live-report-permissions";
import { canExecute } from "@/modules/workbench/service";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { writeAudit } from "@/lib/audit";
import { activeLeadFields, leadDataSchema, leadValues } from "@/modules/leads/schema";
import { metricFields } from "@/modules/live-reports/schema";
import { powderFields, audienceHundredths, parseDuration } from "@/modules/live-reports/input-metrics";
export const liveFields = activeLeadFields.filter(([k]) => k !== "leadMode" && !powderFields.some(([p]) => p === k));
export function liveValues(raw: unknown) { const all = leadValues(raw); return Object.fromEntries(liveFields.map(([k]) => [k, all[k]])); }
export async function readReportingSetting(tx: Prisma.TransactionClient, token: string) {
 const actor = await requireReadAccountActor(tx,token); if(!isAccountBoss(actor)) throw new UserActionError("仅老板可设置填写岗位");
 return await tx.reportingSetting.findUnique({where:{id:"company"}}) ?? {role:"LEAD_SPECIALIST",version:0};
}
export async function saveReportingSetting(tx: Prisma.TransactionClient, token:string, raw:unknown, ip:string) {
 const input=z.object({role:z.enum(["CONTROLLER","LEAD_SPECIALIST"]),version:z.coerce.number().int().min(0)}).parse(raw);
 await acquireUserMutationLock(tx);const actor=await requireAccountActor(tx,token); if(!isAccountBoss(actor)) throw new UserActionError("仅老板可设置填写岗位");
 const old=await tx.reportingSetting.findUnique({where:{id:"company"}});if((old?.version??0)!==input.version)throw new UserActionError("设置已更新，请刷新核对");
 const after=await tx.reportingSetting.upsert({where:{id:"company"},create:{id:"company",role:input.role},update:{role:input.role,version:{increment:1}}});
 await writeAudit({db:tx,actorId:actor.id,action:"LIVE_REPORT_UPDATE",targetType:"ReportingSetting",targetId:"company",ip,detail:{actorName:actor.name,before:old?.role??"LEAD_SPECIALIST",after:after.role,version:after.version}});return after.version;
}
export async function readSessionLiveData(tx:Prisma.TransactionClient,token:string,id:string) {
 const actor=await requireReadAccountActor(tx,token);
 const s=await tx.workSession.findFirst({where:{id,deletedAt:null,sourceRecord:historicalAccountScope(actor)},include:{sourceRecord:{include:{branch:true}},account:{select:{controllerId:true,branchId:true}},report:{select:{deletedAt:true}}}});
 if(!s||s.liveDataRole!=="CONTROLLER")return null;
 const editable=canManageLiveReports(actor,s.sourceRecord.branch)||(canExecute(actor,s.account,s.controllerId)&&(!s.loginUserId||s.loginUserId===actor.id||isAccountBoss(actor)));
 const history=await tx.auditLog.findMany({where:{targetType:"SessionLiveData",targetId:s.id},select:{id:true,detail:true,createdAt:true},orderBy:{createdAt:"desc"}});
 return {history,id:s.id,version:s.liveDataVersion,values:liveValues(s.liveDataDraft),submitted:!!s.liveDataSubmittedAt,editable:editable&&!s.report?.deletedAt,ended:!!s.endedAt&&["WRAP","COMPLETE"].includes(s.phase)};
}
export async function saveSessionLiveData(tx:Prisma.TransactionClient,token:string,raw:unknown,ip:string) {
 const input=z.object({id:z.string().min(1),version:z.coerce.number().int().min(0),command:z.enum(["save","complete"]),reason:z.string().trim().max(2000).default(""),data:z.unknown()}).parse(raw);
 // Pick only live fields before validation: clients cannot inject powder data.
 const values=leadDataSchema.parse(liveValues(input.data));
 await acquireUserMutationLock(tx);const actor=await requireAccountActor(tx,token);
 const access=await readSessionLiveData(tx,token,input.id);if(!access?.editable)throw new UserActionError("记录不存在或无填写权限");
 if(!access.ended)throw new UserActionError("实际下播后才能填写直播数据");
 if(access.version!==input.version)throw new UserActionError("直播数据已更新，请保留输入并刷新核对");
 if(access.submitted&&!input.reason)throw new UserActionError("请填写更正原因");
 const s=await tx.workSession.findUniqueOrThrow({where:{id:input.id},include:{sourceRecord:true}});
 const complete=input.command==="complete"||access.submitted;
 if(complete){
  const missing=liveFields.filter(([k])=>values[k]==="");if(missing.length)throw new UserActionError(`请补齐：${missing.map(([,l])=>l).join("、")}`);
  const seconds=parseDuration(values.durationText)??0;if(!seconds||!s.startedAt||s.startedAt.getTime()+seconds*1000>Date.now())throw new UserActionError("请核对直播时长，结束时间不能晚于现在");
  const source=s.sourceRecord;
  const fields={...Object.fromEntries(metricFields.map(([k])=>[k,Number(values[k])])) as Record<typeof metricFields[number][0],number>,durationSeconds:seconds,averageStayHundredths:Math.round(Number(values.averageStayMinutes)*100),femaleHundredths:audienceHundredths(values.femalePercent),age31To40Hundredths:audienceHundredths(values.age31To40Percent),updatedByName:actor.name};
  await tx.liveReport.upsert({where:{workSessionId:s.id},update:{...fields,version:{increment:1}},create:{...fields,workSessionId:s.id,accountId:s.accountId,sourceRecordId:s.sourceRecordId,branchId:source.branchId,branchName:source.branchName,accountName:source.name,douyinId:source.douyinId,controllerId:s.actualControllerId??s.controllerId,controllerName:s.actualControllerName??source.controllerName,operatorId:source.operatorId,anchorId:s.actualAnchorId??source.anchorId,anchorName:s.actualAnchorName??source.anchorName,startedAt:s.startedAt,sessionLabel:s.label,createdById:actor.id,createdByName:actor.name}});
 }
 const after=await tx.workSession.update({where:{id:s.id},data:{liveDataDraft:liveValues(values),liveDataVersion:{increment:1},...(complete&&!access.submitted?{liveDataSubmittedAt:new Date()}: {})}});
 await writeAudit({db:tx,actorId:actor.id,action:"LIVE_REPORT_UPDATE",targetType:"SessionLiveData",targetId:s.id,ip,detail:{actorName:actor.name,reason:input.reason,before:s.liveDataDraft,after:after.liveDataDraft,version:after.liveDataVersion,submitted:complete,changes:[...liveFields.filter(([k])=>liveValues(s.liveDataDraft)[k]!==values[k]).map(([k,label])=>({field:label,before:liveValues(s.liveDataDraft)[k]||"未填写",after:values[k]||"未填写"})),...(!access.submitted&&complete?[{field:"直播填报状态",before:"待填写",after:"已提交"}]:[])]}});return after.liveDataVersion;
}
