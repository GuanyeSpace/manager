import type { Prisma } from "@/app/generated/prisma/client";
import { requireAccountActor } from "@/modules/accounts/service";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import { hasRole, roleWhere } from "@/lib/auth/roles";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { writeAudit } from "@/lib/audit";
import { backendSchema, confirmedSchema, recycleSchema, resolveFilters, pastDay, totalCents, moneyText, period } from "./schema";
export async function requireSettlementBoss(tx:Prisma.TransactionClient,token:string) {
  const actor=await requireAccountActor(tx,token);if(!isAccountBoss(actor))throw new UserActionError("仅老板可以管理和查看确定打粉数据");return actor;
}
function json(value:unknown):Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)); }
export async function saveBackend(tx:Prisma.TransactionClient,token:string,raw:unknown,ip:string) {
  const v=backendSchema.parse(raw);await acquireUserMutationLock(tx);const actor=await requireSettlementBoss(tx,token);
  const old=v.id ? await tx.leadBackend.findUnique({where:{id:v.id}}):null;
  if(v.id&&!old)throw new UserActionError("后端不存在");
  if(old&&(old.version!==v.version||!v.reason))throw new UserActionError(old.version!==v.version?"资料已被修改，请刷新核对":"请填写更正原因");
  const data={name:v.name,url:old?.url??"",active:v.active};
  const row=old?await tx.leadBackend.update({where:{id:old.id},data:{...data,version:{increment:1}}}):await tx.leadBackend.create({data});
  await writeAudit({db:tx,actorId:actor.id,action:"LIVE_REPORT_UPDATE",targetType:"LeadBackend",targetId:row.id,ip,detail:{actorName:actor.name,reason:v.reason,before:json(old),after:json(row)}});return row.id;
}
export async function saveConfirmed(tx:Prisma.TransactionClient,token:string,raw:unknown,ip:string) {
  const v=confirmedSchema.parse(raw);await acquireUserMutationLock(tx);const actor=await requireSettlementBoss(tx,token);
  if(!pastDay(v.day))throw new UserActionError("确定数据只能登记昨天及以前的日期");
  const old=v.id?await tx.confirmedLead.findUnique({where:{id:v.id}}):null;
  if(v.id&&!old)throw new UserActionError("记录不存在");
  if(old?.deletedAt)throw new UserActionError("请先恢复记录");
  if(old&&(old.version!==v.version||!v.reason))throw new UserActionError(old.version!==v.version?"记录已被修改，请刷新核对":"请填写更正原因");
  const anchor=await tx.user.findFirst({where:{id:v.anchorId,AND:[roleWhere("ANCHOR")]},select:{id:true,name:true}});
  if(!anchor && old?.anchorId!==v.anchorId)throw new UserActionError("请选择已有主播员工");
  const backend=await tx.leadBackend.findUnique({where:{id:v.backendId}});
  if(!backend||(!backend.active&&old?.backendId!==backend.id))throw new UserActionError("请选择启用的后端");
  const duplicate=await tx.confirmedLead.findUnique({where:{day_anchorId_backendId:{day:v.day,anchorId:v.anchorId,backendId:v.backendId}}});
  if(duplicate&&duplicate.id!==old?.id)throw new UserActionError(duplicate.deletedAt?"该日期、主播和后端记录在回收站，请恢复原记录":"该日期、主播和后端已有记录，请编辑原记录");
  const data={day:v.day,anchorId:v.anchorId,anchorName:old?.anchorId===v.anchorId?old.anchorName:anchor!.name,backendId:v.backendId,backendName:old?.backendId===v.backendId?old.backendName:backend.name,backendUrl:old?.backendUrl??"",joinCount:v.joinCount,effectiveCount:v.effectiveCount,backendUnitCents:v.backendUnit,anchorUnitCents:v.anchorUnit};
  const row=old?await tx.confirmedLead.update({where:{id:old.id},data:{...data,version:{increment:1}}}):await tx.confirmedLead.create({data});
  await writeAudit({db:tx,actorId:actor.id,action:"LIVE_REPORT_UPDATE",targetType:"ConfirmedLead",targetId:row.id,ip,detail:{actorName:actor.name,reason:v.reason,before:json(old),after:json(row)}});return row.id;
}
export async function recycleConfirmed(tx:Prisma.TransactionClient,token:string,raw:unknown,ip:string) {
  const v=recycleSchema.parse(raw);await acquireUserMutationLock(tx);const actor=await requireSettlementBoss(tx,token);
  const old=await tx.confirmedLead.findUnique({where:{id:v.id}});
  if(!old||old.version!==v.version)throw new UserActionError("记录不存在或已更新，请刷新核对");
  const deleting=v.operation==="delete";if(deleting===!!old.deletedAt)throw new UserActionError("记录状态已变化");
  const row=await tx.confirmedLead.update({where:{id:v.id},data:{deletedAt:deleting?new Date():null,version:{increment:1}}});
  await writeAudit({db:tx,actorId:actor.id,action:"LIVE_REPORT_UPDATE",targetType:"ConfirmedLead",targetId:row.id,ip,detail:{actorName:actor.name,reason:v.reason,operation:v.operation,before:json(old),after:json(row)}});return row.id;
}
export async function settlementOptions(tx:Prisma.TransactionClient,token:string) {
  await requireSettlementBoss(tx,token);
  const anchors=await tx.user.findMany({where:{OR:[roleWhere("ANCHOR"),{confirmedLeads:{some:{}}}]},select:{id:true,name:true},orderBy:{name:"asc"}});
  const backends=await tx.leadBackend.findMany({orderBy:{name:"asc"}});return {anchors,backends};
}
export async function readConfirmed(tx:Prisma.TransactionClient,token:string,raw:unknown) {
  await requireSettlementBoss(tx,token);const filters=resolveFilters(raw);
  const where:Prisma.ConfirmedLeadWhereInput={deletedAt:filters.trash==="true"?{not:null}:null,...(filters.anchorId?{anchorId:filters.anchorId}:{}),...(filters.backendId?{backendId:filters.backendId}:{}),day:{...(filters.from?{gte:filters.from}:{}),...(filters.to?{lte:filters.to}:{})}};
  const all=await tx.confirmedLead.findMany({where,orderBy:[{day:"desc"},{anchorName:"asc"},{id:"asc"}]});
  const pages=Math.max(1,Math.ceil(all.length/20)),page=Math.min(filters.page,pages);
  return {filters:{...filters,page},count:all.length,pages,rows:all.slice((page-1)*20,page*20),summary:{joins:all.reduce((n,r)=>n+r.joinCount,0),effective:all.reduce((n,r)=>n+r.effectiveCount,0),revenue:moneyText(all.reduce((n,r)=>n+totalCents(r.effectiveCount,r.backendUnitCents),BigInt(0))),commission:moneyText(all.reduce((n,r)=>n+totalCents(r.effectiveCount,r.anchorUnitCents),BigInt(0)))},...await settlementOptions(tx,token)};
}
export async function readConfirmedDetail(tx:Prisma.TransactionClient,token:string,id:string) {
  await requireSettlementBoss(tx,token);const row=await tx.confirmedLead.findUnique({where:{id}});if(!row)return null;
  return {row,...await settlementOptions(tx,token),history:await tx.auditLog.findMany({where:{targetType:"ConfirmedLead",targetId:id},orderBy:{createdAt:"desc"},select:{id:true,createdAt:true,detail:true}})};
}
export async function readAnchorIncome(tx:Prisma.TransactionClient,token:string,raw:unknown) {
  const actor=await requireAccountActor(tx,token);if(!hasRole(actor,"ANCHOR"))throw new UserActionError("仅主播可以查看本人提成");
  const filters=resolveFilters(raw,new Date(),true);
  // Deliberately select no backend, other staff, or backend prices for the anchor DTO.
  const rows=await tx.confirmedLead.findMany({where:{anchorId:actor.id,deletedAt:null,day:{...(filters.from?{gte:filters.from}:{}),...(filters.to?{lte:filters.to}:{})}},select:{day:true,joinCount:true,effectiveCount:true,anchorUnitCents:true},orderBy:{day:"desc"}});
  const grouped=new Map<string,{period:string;joins:number;effective:number;cents:bigint}>();
  for(const r of rows){const key=period(r.day,filters.group),g=grouped.get(key)??{period:key,joins:0,effective:0,cents:BigInt(0)};g.joins+=r.joinCount;g.effective+=r.effectiveCount;g.cents+=totalCents(r.effectiveCount,r.anchorUnitCents);grouped.set(key,g);}
  const totals=[...grouped.values()].reduce((a,r)=>({joins:a.joins+r.joins,effective:a.effective+r.effective,cents:a.cents+r.cents}),{joins:0,effective:0,cents:BigInt(0)});
  return {filters:{from:filters.from,to:filters.to,group:filters.group,preset:filters.preset},rows:[...grouped.values()].map(({cents,...r})=>({...r,income:moneyText(cents)})),totals:{joins:totals.joins,effective:totals.effective,income:moneyText(totals.cents)}};
}
