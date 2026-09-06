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
import { getCurrentSessionToken } from "@/lib/auth/session";
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
  createUserMutation,
  resetPasswordMutation,
} from "@/modules/users/user-mutations";
import { AuditAction } from "@/app/generated/prisma/enums";

export type UserFormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[] | undefined>;
    }
  | undefined;

// 页面级守卫：先做一次身份/岗位/强制改密校验。
// 它只是第一道防线；敏感写入还会在事务内再次复核操作者与会话。
async function guard(): Promise<{ actor: CurrentUser; sessionToken: string }> {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  assertCanManageUsers(user);
  const sessionToken = await getCurrentSessionToken();
  if (!sessionToken) redirect("/login");
  return { actor: user, sessionToken };
}

function isUniqueConflict(e: unknown): boolean {
  return (e as { code?: string })?.code === "P2002";
}

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

export async function createUserAction(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const { actor, sessionToken } = await guard();

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

  const passwordHash = await hash(parsed.data.initialPassword, 10);
  try {
    await prisma.$transaction(async (tx) => {
      const newUser = await createUserMutation(tx, actor.id, sessionToken, {
        name: parsed.data.name,
        username: parsed.data.username,
        passwordHash,
        role: parsed.data.role,
        branchId: parsed.data.branchId,
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
    return toUserFormState(e);
  }

  redirect("/boss/users");
}

export async function updateUserAction(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const { actor, sessionToken } = await guard();

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
      const { before, updated } = await updateUserMutation(
        tx,
        actor.id,
        sessionToken,
        parsed.data.userId,
        { name: parsed.data.name, role: parsed.data.role, branchId: parsed.data.branchId }
      );
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
  const { actor, sessionToken } = await guard();

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    await prisma.$transaction(async (tx) => {
      const target = await resignUserMutation(tx, actor.id, sessionToken, parsed.data.userId);
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
  const { actor, sessionToken } = await guard();

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    await prisma.$transaction(async (tx) => {
      const target = await reactivateUserMutation(tx, actor.id, sessionToken, parsed.data.userId);
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
  const { actor, sessionToken } = await guard();

  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get("userId"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const passwordHash = await hash(parsed.data.newPassword, 10);
  try {
    await prisma.$transaction(async (tx) => {
      const target = await resetPasswordMutation(
        tx,
        actor.id,
        sessionToken,
        parsed.data.userId,
        passwordHash
      );
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
    return toUserFormState(e);
  }

  redirect(`/boss/users/${parsed.data.userId}`);
}
