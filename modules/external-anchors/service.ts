import { requireReadAccountActor } from "@/lib/auth/read-actor";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireAccountActor } from "@/modules/accounts/service";
import { canManageAccountBranch, isAccountBoss } from "@/lib/auth/account-permissions";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { writeAudit } from "@/lib/audit";
export const externalAnchorSchema = z.object({ id: z.string().default(""), version: z.coerce.number().int().min(0), name: z.string().trim().min(1,"请输入姓名或称呼").max(100), branchId: z.string().min(1), active: z.enum(["true","false"]), notes: z.string().trim().max(2000).default("") });
export async function readExternalAnchors(tx: Prisma.TransactionClient, token: string) {
  const actor = await requireReadAccountActor(tx,token);
  const branches = await tx.branch.findMany({ where: { status: "ACTIVE", ...(isAccountBoss(actor) ? {} : { id: actor.branchId ?? "", managerId: actor.id }) }, select: { id: true, name: true, managerId: true } });
  const managed = branches.filter(b => canManageAccountBranch(actor,b));
  const rows = await tx.externalAnchor.findMany({ where: { branchId: { in: managed.map(b=>b.id) } }, include: { branch: { select: { name: true } } }, orderBy: [{active:"desc"},{name:"asc"}] });
  return { rows, branches: managed.map(({id,name})=>({id,name})) };
}
export async function saveExternalAnchor(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string) {
  const v=externalAnchorSchema.parse(raw); await acquireUserMutationLock(tx); const actor=await requireAccountActor(tx,token);
  const old=v.id ? await tx.externalAnchor.findUnique({where:{id:v.id},include:{branch:true}}) : null;
  if(v.id&&(!old||!canManageAccountBranch(actor,old.branch)))throw new UserActionError("外部主播不存在或无管理权限");
  if(old&&old.version!==v.version)throw new UserActionError("资料已更新，请刷新后重试");
  const branch=await tx.branch.findUnique({where:{id:v.branchId}});
  if(!branch||branch.status!=="ACTIVE"||!canManageAccountBranch(actor,branch))throw new UserActionError("无权管理所选分公司");
  if(old&&old.branchId!==branch.id)throw new UserActionError("已有外部主播不能改换分公司，请在目标分公司另建档案，保留历史关联");
  const data={name:v.name,branchId:v.branchId,active:v.active==="true",notes:v.notes};
  const row=old?await tx.externalAnchor.update({where:{id:old.id},data:{...data,version:{increment:1}}}):await tx.externalAnchor.create({data});
  await writeAudit({db:tx,actorId:actor.id,action:old?"RESOURCE_UPDATE":"RESOURCE_CREATE",targetType:"ExternalAnchor",targetId:row.id,ip,detail:{actorName:actor.name,before:old?{name:old.name,branchId:old.branchId,active:old.active,notes:old.notes}:null,after:data,version:row.version}});
  return row.id;
}
