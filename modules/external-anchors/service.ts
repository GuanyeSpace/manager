import { requireReadAccountActor } from "@/lib/auth/read-actor";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireAccountActor } from "@/modules/accounts/service";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { writeAudit } from "@/lib/audit";
const accountSchema=z.object({id:z.string().default(""),version:z.number().int().min(0),name:z.string().trim().min(1,"请输入抖音名称").max(100),douyinId:z.string().trim().min(1,"请输入抖音号").max(100),active:z.boolean()});
export const externalAnchorSchema=z.object({id:z.string().default(""),version:z.coerce.number().int().min(0),command:z.enum(["save","toggle"]).default("save"),name:z.string().trim().max(100).default(""),notes:z.string().trim().max(2000).default(""),accounts:z.array(accountSchema).optional()});
export async function readExternalAnchors(tx:Prisma.TransactionClient,token:string){
 const actor=await requireReadAccountActor(tx,token);if(!isAccountBoss(actor))throw new UserActionError("仅老板可以维护外部主播资料");
 const rows=await tx.externalAnchor.findMany({include:{accounts:{select:{id:true,version:true,name:true,douyinId:true,active:true},orderBy:{createdAt:"asc"}}},orderBy:[{active:"desc"},{name:"asc"}]});return {rows};
}
export async function saveExternalAnchor(tx:Prisma.TransactionClient,token:string,raw:unknown,ip:string){
 const v=externalAnchorSchema.parse(raw);await acquireUserMutationLock(tx);const actor=await requireAccountActor(tx,token);
 if(!isAccountBoss(actor))throw new UserActionError("仅老板可以维护外部主播资料");
 const old=v.id?await tx.externalAnchor.findUnique({where:{id:v.id},include:{accounts:true}}):null;
 if(v.id&&!old)throw new UserActionError("外部主播不存在");
 if(old&&old.version!==v.version)throw new UserActionError("资料已更新，请刷新后重试");
 if(v.command==="toggle"&&!old)throw new UserActionError("请先保存资料");
 if(v.command==="save"){
  if(!v.name||!v.accounts?.length)throw new UserActionError("请填写姓名及至少一个抖音账号");
  if(new Set(v.accounts.map(a=>a.douyinId)).size!==v.accounts.length)throw new UserActionError("抖音号不能重复");
  const ids=v.accounts.filter(a=>a.id).map(a=>a.id);
  if(new Set(ids).size!==ids.length||ids.some(id=>!old?.accounts.some(a=>a.id===id))||old?.accounts.some(a=>!ids.includes(a.id)))throw new UserActionError("账号关联已变化，已有账号请使用停用，不要移除历史账号");
  for(const a of v.accounts){
   const before=old?.accounts.find(b=>b.id===a.id);
   if(before&&(before.kind!=="EXTERNAL"||before.version!==a.version))throw new UserActionError("账号类型或版本已变化，请刷新核对");
   const duplicate=await tx.douyinAccount.findUnique({where:{douyinId:a.douyinId},select:{id:true}});
   if(duplicate&&duplicate.id!==a.id)throw new UserActionError("该抖音号已存在，请处理已有账号，不能重复登记或自动转移");
   if(before&&(before.name!==a.name||before.douyinId!==a.douyinId||before.active!==a.active)&&await tx.workSession.findFirst({where:{accountId:before.id,phase:{in:["PREPARING","LIVE","WRAP"]}},select:{id:true}}))throw new UserActionError("账号还有未结束场次，请先完成收尾");
  }
 }
 const row=old?await tx.externalAnchor.update({where:{id:old.id},data:{...(v.command==="toggle"?{active:!old.active}:{name:v.name,notes:v.notes}),version:{increment:1}}}):await tx.externalAnchor.create({data:{name:v.name,notes:v.notes}});
 if(v.command==="save")for(const a of v.accounts!){
  const before=old?.accounts.find(b=>b.id===a.id);
  if(before&&before.name===a.name&&before.douyinId===a.douyinId&&before.active===a.active)continue;
  const data={name:a.name,douyinId:a.douyinId,active:a.active};
  const account=before?await tx.douyinAccount.update({where:{id:before.id},data:{...data,version:{increment:1}}}):await tx.douyinAccount.create({data:{...data,kind:"EXTERNAL",externalAnchorId:row.id,homepageUrl:"",realName:"",phone:"",purpose:"",notes:""}});
  const now=new Date();const previous=before?await tx.accountRecord.findFirst({where:{accountId:account.id,endedAt:null},orderBy:{version:"desc"}}):null;
  if(before)await tx.accountRecord.updateMany({where:{accountId:account.id,endedAt:null},data:{endedAt:now}});
  await tx.accountRecord.create({data:{accountId:account.id,branchId:account.branchId,branchName:previous?.branchName??"",name:account.name,douyinId:account.douyinId,active:account.active,banned:account.banned,unbanDate:account.unbanDate,externalAnchorId:row.id,externalAnchorName:row.name,operatorId:previous?.operatorId,operatorName:previous?.operatorName,controllerId:previous?.controllerId,controllerName:previous?.controllerName,anchorId:previous?.anchorId,anchorName:previous?.anchorName,actorName:actor.name,version:account.version,startedAt:now}});
 }
 const after=await tx.externalAnchor.findUniqueOrThrow({where:{id:row.id},include:{accounts:true}});
 await writeAudit({db:tx,actorId:actor.id,action:old?"RESOURCE_UPDATE":"RESOURCE_CREATE",targetType:"ExternalAnchor",targetId:row.id,ip,detail:JSON.parse(JSON.stringify({command:v.command,actorName:actor.name,before:old,after}))});return row.id;
}
