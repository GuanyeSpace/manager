import type { Prisma } from "@/app/generated/prisma/client";
import { Role, EmploymentStatus, BranchStatus } from "@/app/generated/prisma/enums";
import {
  acquireUserMutationLock,
  assertActorCanManage,
  assertActiveBossInvariant,
  UserActionError,
  ActorPermissionChangedError,
} from "./boss-guard";

export type UpdateUserInput = {
  name: string;
  role: Role;
  branchId?: string;
};

export type CreateUserInput = {
  name: string;
  username: string;
  passwordHash: string;
  role: Role;
  branchId?: string;
};

export type TestHooks = {
  afterUserLock?: () => Promise<void>;
};

type AuthorizedActor = {
  id: string;
  role: Role;
  employmentStatus: EmploymentStatus;
  mustChangePassword: boolean;
};

type TargetUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
  branchId: string | null;
  employmentStatus: EmploymentStatus;
  mustChangePassword: boolean;
};

// 统一的事务内授权：先取管理 advisory lock，再重读操作者最新状态。
// 传入 actorSessionToken 时，同时确认该会话仍存在且未过期，覆盖「等待期间被重置密码/离职」。
async function authorizeActor(
  tx: Prisma.TransactionClient,
  actorId: string,
  actorSessionToken?: string
): Promise<AuthorizedActor> {
  await acquireUserMutationLock(tx);
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: { id: true, role: true, employmentStatus: true, mustChangePassword: true },
  });
  assertActorCanManage(actor);

  if (actorSessionToken) {
    const session = await tx.session.findUnique({ where: { id: actorSessionToken } });
    if (!session || session.userId !== actorId || session.expiresAt.getTime() <= Date.now()) {
      throw new ActorPermissionChangedError();
    }
  }

  return actor!;
}

async function requireActiveBranch(tx: Prisma.TransactionClient, branchId: string): Promise<void> {
  const branch = await tx.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.status !== BranchStatus.ACTIVE) {
    throw new UserActionError("所选分公司不存在或已停用", { branchId: ["所选分公司不存在或已停用"] });
  }
}

export async function updateUserMutation(
  tx: Prisma.TransactionClient,
  actorId: string,
  actorSessionToken: string | undefined,
  targetId: string,
  input: UpdateUserInput
): Promise<{ before: TargetUser; updated: TargetUser }> {
  await authorizeActor(tx, actorId, actorSessionToken);
  const target = await tx.user.findUnique({ where: { id: targetId } });
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
  actorSessionToken: string | undefined,
  targetId: string
): Promise<TargetUser> {
  await authorizeActor(tx, actorId, actorSessionToken);
  const target = await tx.user.findUnique({ where: { id: targetId } });
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
  actorSessionToken: string | undefined,
  targetId: string
): Promise<TargetUser> {
  await authorizeActor(tx, actorId, actorSessionToken);
  const target = await tx.user.findUnique({ where: { id: targetId } });
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

export async function createUserMutation(
  tx: Prisma.TransactionClient,
  actorId: string,
  actorSessionToken: string | undefined,
  input: CreateUserInput
): Promise<{ id: string; username: string; role: Role; branchId: string | null }> {
  await authorizeActor(tx, actorId, actorSessionToken);

  let branchId: string | null = null;
  if (input.role !== Role.BOSS) {
    if (!input.branchId) {
      throw new UserActionError("非老板岗位必须选择所属分公司", {
        branchId: ["非老板岗位必须选择所属分公司"],
      });
    }
    await requireActiveBranch(tx, input.branchId);
    branchId = input.branchId;
  }

  return tx.user.create({
    data: {
      name: input.name,
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role,
      branchId,
      mustChangePassword: true,
    },
  });
}

export async function resetPasswordMutation(
  tx: Prisma.TransactionClient,
  actorId: string,
  actorSessionToken: string | undefined,
  targetId: string,
  newPasswordHash: string,
  hooks?: TestHooks
): Promise<TargetUser> {
  await authorizeActor(tx, actorId, actorSessionToken);
  const target = await tx.user.findUnique({ where: { id: targetId } });
  if (!target) throw new UserActionError("用户不存在");

  // 先管理锁（authorizeActor 已取），再锁目标用户行，避免与登录/改密死锁。
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${targetId} FOR UPDATE`;
  await hooks?.afterUserLock?.();

  await tx.user.update({
    where: { id: targetId },
    data: { passwordHash: newPasswordHash, mustChangePassword: true },
  });
  await tx.session.deleteMany({ where: { userId: targetId } });
  return target;
}
