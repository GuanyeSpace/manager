import type { Prisma } from "@/app/generated/prisma/client";
import { requireAccountActor } from "@/modules/accounts/service";
import { isAccountBoss,canUseAccounts } from "./account-permissions";
import { hasRole } from "./roles";
import { previewRoles,type PreviewRole } from "./preview-path";
import { UserActionError } from "@/modules/users/boss-guard";
export const PREVIEW_TOKEN_PREFIX="readonly-preview:";
// 仅在服务器从真实老板会话构造。它不是员工会话，所有普通写服务拒绝此格式。
export function previewReadToken(token:string,role:PreviewRole,userId:string) {return PREVIEW_TOKEN_PREFIX+JSON.stringify({token,role,userId});}
export async function requireReadAccountActor(tx:Prisma.TransactionClient,value:string){
 if(!value.startsWith(PREVIEW_TOKEN_PREFIX))return requireAccountActor(tx,value);
 let parsed:{token:string;role:PreviewRole;userId:string};
 try{parsed=JSON.parse(value.slice(PREVIEW_TOKEN_PREFIX.length));}catch{throw new UserActionError("预览参数无效");}
 if(typeof parsed.token!=="string"||typeof parsed.userId!=="string"||!Object.hasOwn(previewRoles,parsed.role)||parsed.token.startsWith(PREVIEW_TOKEN_PREFIX))throw new UserActionError("预览参数无效");
 const boss=await requireAccountActor(tx,parsed.token);if(!isAccountBoss(boss))throw new UserActionError("仅老板可以预览工作台");
 const target=await tx.user.findUnique({where:{id:parsed.userId},select:{id:true,name:true,role:true,roles:true,branchId:true,employmentStatus:true,mustChangePassword:true}});
 if(!target||!canUseAccounts(target)||!hasRole(target,previewRoles[parsed.role].role))throw new UserActionError("预览员工不存在、已离职或岗位状态已变化");
 return target;
}
