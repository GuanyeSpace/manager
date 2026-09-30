import { hasRole, userRoles } from "@/lib/auth/roles";
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
  roles?: Role[];
  branchId?: string;
  expectedRoles?: string;
};

export type CreateUserInput = {
  name: string;
  username: string;
  passwordHash: string;
  role: Role;
  roles?: Role[];
  branchId?: string;
  expectedRoles?: string;
};

export type TestHooks = {
  afterUserLock?: () => Promise<void>;
};

type AuthorizedActor = {
  id: string;
  role: Role;
  roles?: Role[];
  employmentStatus: EmploymentStatus;
  mustChangePassword: boolean;
};

type TargetUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
  roles?: Role[];
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
    select: { id: true, role: true, roles: true, employmentStatus: true, mustChangePassword: true },
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

// 人员离职、调岗或调公司前必须完成账号及分公司负责人交接。
async function requireAccountHandover(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const account = await tx.douyinAccount.findFirst({ where: {
    OR: [{ operatorId: userId }, { controllerId: userId }, { anchorId: userId }],
  }, select: { id: true } });
  const branch = await tx.branch.findFirst({ where: { managerId: userId }, select: { id: true } });
  const room = await tx.liveRoom.findFirst({ where: { OR: [{ operatorId: userId }, { controllerId: userId }, { anchors: { some: { userId } } }] }, select: { id: true } });
  const number = await tx.phoneNumber.findFirst({ where: { OR: [{ operatorId: userId }, { controllerId: userId }, { userId }] }, select: { id: true } });
  const device = await tx.assetDevice.findFirst({ where: { splitAt: null, OR: [{ operatorId: userId }, { controllerId: userId }, { userId }] }, select: { id: true } });
  if (room || number || device) throw new UserActionError("该用户仍负责直播间或使用手机号、手机、设备，请先完成交接");
  if (account || branch) throw new UserActionError("该用户仍绑定抖音账号或担任分公司负责人，请先完成交接");
}

function selectedRoles(input: { role: Role; roles?: Role[] }): Role[] {
  const roles = [...new Set(input.roles ?? [input.role])];
  if (!roles.length || roles.some(role => !Object.values(Role).includes(role))) throw new UserActionError("请至少选择一个有效岗位");
  return roles;
}
async function requireRemovedRoleHandover(tx: Prisma.TransactionClient, userId: string, removed: Role[]) {
  for (const role of removed) {
    const key = role === Role.CONTROLLER ? "controllerId" : role === Role.OPERATOR ? "operatorId" : role === Role.ANCHOR ? "anchorId" : null;
    if (!key) continue;
    const account = await tx.douyinAccount.findFirst({ where: { [key]: userId }, select: { id: true } });
    const room = await tx.liveRoom.findFirst({ where: key === "anchorId" ? { anchors: { some: { userId } } } : { [key]: userId }, select: { id: true } });
    const number = key === "anchorId" ? null : await tx.phoneNumber.findFirst({ where: { [key]: userId }, select: { id: true } });
    const device = key === "anchorId" ? null : await tx.assetDevice.findFirst({ where: { splitAt: null, [key]: userId }, select: { id: true } });
    if (account || room || number || device) throw new UserActionError("撤销的岗位仍有账号、直播间或物资职责，请先完成该岗位交接");
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

  const selected = selectedRoles(input);
  if (input.expectedRoles !== undefined && input.expectedRoles !== [...userRoles(target)].sort().join(",")) throw new UserActionError("员工岗位已被修改，请保留输入并刷新后核对");
  const role = selected.includes(Role.BOSS) ? Role.BOSS : selected.includes(target.role) ? target.role : selected[0];
  const roles = selected.filter(r => r !== role);
  if (target.id === actorId && !selected.includes(Role.BOSS)) {
    throw new UserActionError("不能把自己的岗位改成非老板");
  }

  let branchId: string | null = null;
  if (role !== Role.BOSS) {
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

  if (target.branchId !== branchId && role !== Role.BOSS) await requireAccountHandover(tx, targetId);
  else if (role !== Role.BOSS) await requireRemovedRoleHandover(tx, targetId, userRoles(target).filter(r => !selected.includes(r)));
  await assertActiveBossInvariant(tx, target, role, target.employmentStatus, roles);
  const updated = await tx.user.update({
    where: { id: targetId },
    data: { name: input.name, role, roles, branchId },
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

  await requireAccountHandover(tx, targetId);
  await assertActiveBossInvariant(tx, target, target.role, EmploymentStatus.RESIGNED, target.roles);
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

  if (!hasRole(target, Role.BOSS)) {
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
): Promise<{ id: string; username: string; role: Role; roles: Role[]; branchId: string | null }> {
  await authorizeActor(tx, actorId, actorSessionToken);

  const selected = selectedRoles(input);
  const role = selected.includes(Role.BOSS) ? Role.BOSS : selected[0];
  const roles = selected.filter(r => r !== role);
  let branchId: string | null = null;
  if (role !== Role.BOSS) {
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
      role, roles,
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
