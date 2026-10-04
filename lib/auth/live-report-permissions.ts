import { hasRole, type RoleHolder } from "./roles";
import type { Prisma } from "@/app/generated/prisma/client";
import { Role } from "@/app/generated/prisma/enums";
import { isAccountBoss, isExecutionController, type AccountActor } from "./account-permissions";

export function isLeadSpecialist(actor: RoleHolder): boolean { return hasRole(actor, Role.LEAD_SPECIALIST); }
export function isReportOperator(actor: RoleHolder): boolean { return hasRole(actor, Role.OPERATOR); }
export function canViewLiveReports(actor: RoleHolder): boolean { return !isExecutionController(actor) || isLeadSpecialist(actor); }
// 没有具体分公司上下文时仅老板能取得全局维护能力。
export function canManageLiveReports(actor: AccountActor, branch?: { id: string; managerId: string | null } | null): boolean {
  return isAccountBoss(actor) || !isExecutionController(actor) && !!branch && actor.branchId === branch.id && branch.managerId === actor.id;
}
export function reportManagementScope(actor: AccountActor): Prisma.BranchWhereInput {
  return isAccountBoss(actor) ? {} : isExecutionController(actor) ? { id: { in: [] } } : { id: actor.branchId ?? "", managerId: actor.id };
}
