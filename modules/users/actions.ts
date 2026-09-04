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
import { destroyAllSessionsOfUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  userIdSchema,
} from "@/modules/users/schema";
import { countActiveBosses } from "@/modules/users/queries";
import { AuditAction, Role, EmploymentStatus, BranchStatus } from "@/app/generated/prisma/enums";

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

// 校验所选分公司存在且启用（新增/编辑时，非老板岗位用）
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

  // 老板跨分公司（branchId 置空）；其他岗位必须选启用中的分公司
  let branchId: string | null = null;
  if (parsed.data.role !== Role.BOSS) {
    const branchError = await validateActiveBranch(parsed.data.branchId!);
    if (branchError) return { fieldErrors: { branchId: [branchError] } };
    branchId = parsed.data.branchId!;
  }

  const passwordHash = await hash(parsed.data.initialPassword, 10);
  try {
    const newUser = await prisma.user.create({
      data: {
        name: parsed.data.name,
        username: parsed.data.username,
        passwordHash,
        role: parsed.data.role,
        branchId,
        mustChangePassword: true, // 新建用户一律首次登录强制改密
      },
    });
    await writeAudit({
      actorId: actor.id,
      action: AuditAction.USER_CREATE,
      targetType: "User",
      targetId: newUser.id,
      detail: { username: newUser.username, role: newUser.role, branchId: newUser.branchId },
      ip: await getClientIp(),
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

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return { error: "用户不存在" };

  // 安全规则 1：不能把自己的岗位改成非老板
  if (target.id === actor.id && parsed.data.role !== Role.BOSS) {
    return { error: "不能把自己的岗位改成非老板" };
  }

  // 安全规则 2：系统必须至少保留一个在职老板
  if (
    target.role === Role.BOSS &&
    target.employmentStatus === EmploymentStatus.ACTIVE &&
    parsed.data.role !== Role.BOSS
  ) {
    const activeBosses = await countActiveBosses();
    if (activeBosses <= 1) {
      return { error: "系统至少需要保留一个在职老板" };
    }
  }

  // 分公司：老板置空；其他岗位校验启用（保持原分公司不变时允许其为停用状态）
  let branchId: string | null = null;
  if (parsed.data.role !== Role.BOSS) {
    if (parsed.data.branchId !== target.branchId) {
      const branchError = await validateActiveBranch(parsed.data.branchId!);
      if (branchError) return { fieldErrors: { branchId: [branchError] } };
    }
    branchId = parsed.data.branchId!;
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { name: parsed.data.name, role: parsed.data.role, branchId },
  });
  await writeAudit({
    actorId: actor.id,
    action: AuditAction.USER_UPDATE,
    targetType: "User",
    targetId: target.id,
    detail: {
      username: target.username,
      changes: {
        name: { from: target.name, to: updated.name },
        role: { from: target.role, to: updated.role },
        branchId: { from: target.branchId, to: updated.branchId },
      },
    },
    ip: await getClientIp(),
  });

  redirect(`/boss/users/${target.id}`);
}

export async function resignUserAction(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const actor = await guard();

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return { error: "用户不存在" };
  if (target.employmentStatus === EmploymentStatus.RESIGNED) {
    return { error: "该用户已是离职状态" };
  }

  // 安全规则 3：不能把自己设为离职
  if (target.id === actor.id) {
    return { error: "不能把自己设为离职" };
  }

  // 安全规则 2：至少保留一个在职老板
  if (target.role === Role.BOSS) {
    const activeBosses = await countActiveBosses();
    if (activeBosses <= 1) {
      return { error: "系统至少需要保留一个在职老板" };
    }
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { employmentStatus: EmploymentStatus.RESIGNED },
  });
  // 立即失效：删除该用户全部会话
  await destroyAllSessionsOfUser(target.id);
  await writeAudit({
    actorId: actor.id,
    action: AuditAction.USER_RESIGN,
    targetType: "User",
    targetId: target.id,
    detail: { username: target.username },
    ip: await getClientIp(),
  });

  redirect(`/boss/users/${target.id}`);
}

export async function reactivateUserAction(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const actor = await guard();

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return { error: "用户不存在" };
  if (target.employmentStatus === EmploymentStatus.ACTIVE) {
    return { error: "该用户已是在职状态" };
  }
  if (target.role !== Role.BOSS && !target.branchId) {
    return { error: "该用户没有所属分公司，请先编辑补充后复职" };
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { employmentStatus: EmploymentStatus.ACTIVE },
  });
  await writeAudit({
    actorId: actor.id,
    action: AuditAction.USER_REACTIVATE,
    targetType: "User",
    targetId: target.id,
    detail: { username: target.username },
    ip: await getClientIp(),
  });

  redirect(`/boss/users/${target.id}`);
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
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash, mustChangePassword: true }, // 重置后首次登录强制改密
  });
  // 重置密码后旧会话全部失效（开工前确认过的默认值）
  await destroyAllSessionsOfUser(target.id);
  await writeAudit({
    actorId: actor.id,
    action: AuditAction.PASSWORD_RESET,
    targetType: "User",
    targetId: target.id,
    detail: { username: target.username },
    ip: await getClientIp(),
  });

  redirect(`/boss/users/${target.id}`);
}
