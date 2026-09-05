"use server";

import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  requirePageUser,
  requirePasswordChanged,
  assertCanManageUsers,
} from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  userIdSchema,
} from "@/modules/users/schema";
import {
  ActiveBossConstraintError,
  ActorPermissionChangedError,
  UserActionError,
} from "@/modules/users/boss-guard";
import {
  updateUserMutation,
  resignUserMutation,
  reactivateUserMutation,
} from "@/modules/users/user-mutations";
import { AuditAction, Role, BranchStatus } from "@/app/generated/prisma/enums";

export type UserFormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[] | undefined>;
    }
  | undefined;

// 每个动作的第一行都必须独立校验身份与能力，不依赖页面拦截
async function guard(): Promise<CurrentUser> {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  assertCanManageUsers(user);
  return user;
}

function isUniqueConflict(e: unknown): boolean {
  return (e as { code?: string })?.code === "P2002";
}

// 把事务内抛出的领域错误映射成对用户友好的结果。
function toUserFormState(e: unknown): UserFormState {
  if (e instanceof ActiveBossConstraintError) {
    return { error: "系统至少需要保留一个在职老板" };
  }
  if (e instanceof ActorPermissionChangedError) {
    return { error: "您的权限已发生变化，请刷新后重试" };
  }
  if (e instanceof UserActionError) {
    return e.fieldErrors ? { fieldErrors: e.fieldErrors } : { error: e.message };
  }
  if (isUniqueConflict(e)) {
    return { error: "用户名已存在" };
  }
  return { error: "操作失败，请稍后重试" };
}

async function validateActiveBranch(branchId: string): Promise<string | null> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.status !== BranchStatus.ACTIVE) {
    return "所选分公司不存在或已停用";
  }
  return null;
}

export async function createUserAction(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const actor = await guard();

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    username: formData.get("username"),
    initialPassword: formData.get("initialPassword"),
    role: formData.get("role"),
    branchId: formData.get("branchId") || undefined,
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let branchId: string | null = null;
  if (parsed.data.role !== Role.BOSS) {
    if (!parsed.data.branchId) {
      return { fieldErrors: { branchId: ["非老板岗位必须选择所属分公司"] } };
    }
    const branchError = await validateActiveBranch(parsed.data.branchId);
    if (branchError) return { fieldErrors: { branchId: [branchError] } };
    branchId = parsed.data.branchId;
  }

  const passwordHash = await hash(parsed.data.initialPassword, 10);
  try {
    await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: parsed.data.name,
          username: parsed.data.username,
          passwordHash,
          role: parsed.data.role,
          branchId,
          mustChangePassword: true,
        },
      });
      await writeAudit({
        db: tx,
        actorId: actor.id,
        action: AuditAction.USER_CREATE,
        targetType: "User",
        targetId: newUser.id,
        detail: { username: newUser.username, role: newUser.role, branchId: newUser.branchId },
        ip: await getClientIp(),
      });
    });
  } catch (e) {
    if (isUniqueConflict(e)) return { error: "用户名已存在" };
    console.error("创建用户失败:", e);
    return { error: "创建失败，请稍后重试" };
  }

  redirect("/boss/users");
}

export async function updateUserAction(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const actor = await guard();

  const parsed = updateUserSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    role: formData.get("role"),
    branchId: formData.get("branchId") || undefined,
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const { before, updated } = await updateUserMutation(tx, actor.id, parsed.data.userId, {
        name: parsed.data.name,
        role: parsed.data.role,
        branchId: parsed.data.branchId,
      });
      await writeAudit({
        db: tx,
        actorId: actor.id,
        action: AuditAction.USER_UPDATE,
        targetType: "User",
        targetId: updated.id,
        detail: {
          username: before.username,
          changes: {
            name: { from: before.name, to: updated.name },
            role: { from: before.role, to: updated.role },
            branchId: { from: before.branchId, to: updated.branchId },
          },
        },
        ip: await getClientIp(),
      });
    });
  } catch (e) {
    return toUserFormState(e);
  }

  redirect(`/boss/users/${parsed.data.userId}`);
}

export async function resignUserAction(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const actor = await guard();

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    await prisma.$transaction(async (tx) => {
      const target = await resignUserMutation(tx, actor.id, parsed.data.userId);
      await writeAudit({
        db: tx,
        actorId: actor.id,
        action: AuditAction.USER_RESIGN,
        targetType: "User",
        targetId: target.id,
        detail: { username: target.username },
        ip: await getClientIp(),
      });
    });
  } catch (e) {
    return toUserFormState(e);
  }

  redirect(`/boss/users/${parsed.data.userId}`);
}

export async function reactivateUserAction(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const actor = await guard();

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    await prisma.$transaction(async (tx) => {
      const target = await reactivateUserMutation(tx, actor.id, parsed.data.userId);
      await writeAudit({
        db: tx,
        actorId: actor.id,
        action: AuditAction.USER_REACTIVATE,
        targetType: "User",
        targetId: target.id,
        detail: { username: target.username },
        ip: await getClientIp(),
      });
    });
  } catch (e) {
    return toUserFormState(e);
  }

  redirect(`/boss/users/${parsed.data.userId}`);
}

export async function resetPasswordAction(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const actor = await guard();

  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get("userId"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return { error: "用户不存在" };

  const passwordHash = await hash(parsed.data.newPassword, 10);
  try {
    await prisma.$transaction(async (tx) => {
      // 锁住目标用户行，与本人改密/登录串行化，保证密码更新 + 旧会话撤销一致。
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${target.id} FOR UPDATE`;
      await tx.user.update({
        where: { id: target.id },
        data: { passwordHash, mustChangePassword: true },
      });
      await tx.session.deleteMany({ where: { userId: target.id } });
      await writeAudit({
        db: tx,
        actorId: actor.id,
        action: AuditAction.PASSWORD_RESET,
        targetType: "User",
        targetId: target.id,
        detail: { username: target.username },
        ip: await getClientIp(),
      });
    });
  } catch (e) {
    console.error("重置密码失败:", e);
    return { error: "重置失败，请稍后重试" };
  }

  redirect(`/boss/users/${target.id}`);
}
