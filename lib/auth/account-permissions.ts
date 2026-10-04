import { hasRole, type RoleHolder } from "./roles";
import { Role, EmploymentStatus } from "@/app/generated/prisma/enums";

export type AccountActor = {
  id: string;
  role: Role;
  roles?: Role[];
  branchId: string | null;
  employmentStatus: EmploymentStatus;
  mustChangePassword: boolean;
};

export function isAccountBoss(actor: RoleHolder): boolean {
  return hasRole(actor, Role.BOSS);
}

export function canUseAccounts(actor: AccountActor): boolean {
  return actor.employmentStatus === EmploymentStatus.ACTIVE && !actor.mustChangePassword;
}

export function canManageAccountBranch(
  actor: AccountActor,
  branch: { id: string; managerId: string | null } | null
): boolean {
  return !!branch && canUseAccounts(actor) && !isExecutionController(actor) && (isAccountBoss(actor) ||
    (actor.branchId === branch.id && branch.managerId === actor.id));
}

export function canFillAccountDuty(actor: AccountActor, branchId: string, role: Role): boolean {
  return actor.employmentStatus === EmploymentStatus.ACTIVE &&
    (isAccountBoss(actor) || (actor.branchId === branchId && hasRole(actor, role)));
}

export function accountMembershipWhere(userId: string) {
  return { OR: [{ operatorId: userId }, { controllerId: userId }, { anchorId: userId }] };
}

export function isExecutionController(actor: RoleHolder): boolean { return hasRole(actor, Role.CONTROLLER) && !hasRole(actor, Role.BOSS) && !hasRole(actor, Role.OPERATOR); }
