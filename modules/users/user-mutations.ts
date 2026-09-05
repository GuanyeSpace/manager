import type { Prisma } from "@/app/generated/prisma/client";
import { Role, EmploymentStatus, BranchStatus } from "@/app/generated/prisma/enums";
import {
  acquireUserMutationLock,
  assertActorCanManage,
  assertActiveBossInvariant,
  UserActionError,
} from "./boss-guard";

export type UpdateUserInput = {
  name: string;
  role: Role;
  branchId?: string;
};

type TargetUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
  branchId: string | null;
  employmentStatus: EmploymentStatus;
};

async function lockAndReload(
  tx: Prisma.TransactionClient,
  actorId: string,
  targetId: string
): Promise<{ actor: TargetUser | null; target: TargetUser | null }> {
  await acquireUserMutationLock(tx);
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  const target = await tx.user.findUnique({ where: { id: targetId } });
  return { actor, target };
}

async function requireActiveBranch(
  tx: Prisma.TransactionClient,
  branchId: string
): Promise<void> {
  const branch = await tx.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.status !== BranchStatus.ACTIVE) {
    throw new UserActionError("所选分公司不存在或已停用", { branchId: ["所选分公司不存在或已停用"] });
  }
}

export async function updateUserMutation(
  tx: Prisma.TransactionClient,
  actorId: string,
  targetId: string,
  input: UpdateUserInput
): Promise<{ before: TargetUser; updated: TargetUser }> {
  const { actor, target } = await lockAndReload(tx, actorId, targetId);
  assertActorCanManage(actor);
  if (!target) throw new UserActionError("用户不存在");

  if (target.id === actorId && input.role !== Role.BOSS) {
    throw new UserActionError("不能把自己的岗位改成非老板");
  }

  let branchId: string | null = null;
  if (input.role !== Role.BOSS) {
    if (!input.branchId) {
      throw new UserActionError("非老板岗位必须选择所属分公司", {
        branchId: ["非老板岗位必须选择所属分公司"],
      });
    }
    if (input.branchId !== target.branchId) {
      await requireActiveBranch(tx, input.branchId);
    }
    branchId = input.branchId;
  }

  await assertActiveBossInvariant(tx, target, input.role, target.employmentStatus);
  const updated = await tx.user.update({
    where: { id: targetId },
    data: { name: input.name, role: input.role, branchId },
  });
  return { before: target, updated };
}

export async function resignUserMutation(
  tx: Prisma.TransactionClient,
  actorId: string,
  targetId: string
): Promise<TargetUser> {
  const { actor, target } = await lockAndReload(tx, actorId, targetId);
  assertActorCanManage(actor);
  if (!target) throw new UserActionError("用户不存在");
  if (target.employmentStatus === EmploymentStatus.RESIGNED) {
    throw new UserActionError("该用户已是离职状态");
  }
  if (target.id === actorId) {
    throw new UserActionError("不能把自己设为离职");
  }

  await assertActiveBossInvariant(tx, target, target.role, EmploymentStatus.RESIGNED);
  await tx.user.update({
    where: { id: targetId },
    data: { employmentStatus: EmploymentStatus.RESIGNED },
  });
  await tx.session.deleteMany({ where: { userId: targetId } });
  return target;
}

export async function reactivateUserMutation(
  tx: Prisma.TransactionClient,
  actorId: string,
  targetId: string
): Promise<TargetUser> {
  const { actor, target } = await lockAndReload(tx, actorId, targetId);
  assertActorCanManage(actor);
  if (!target) throw new UserActionError("用户不存在");
  if (target.employmentStatus === EmploymentStatus.ACTIVE) {
    throw new UserActionError("该用户已是在职状态");
  }

  if (target.role !== Role.BOSS) {
    if (!target.branchId) {
      throw new UserActionError("该用户没有所属分公司，请先编辑补充后复职");
    }
    await requireActiveBranch(tx, target.branchId);
  }

  await tx.user.update({
    where: { id: targetId },
    data: { employmentStatus: EmploymentStatus.ACTIVE },
  });
  return target;
}
