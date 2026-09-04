"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  requirePageUser,
  requirePasswordChanged,
  assertCanManageBranches,
} from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import {
  createBranchSchema,
  renameBranchSchema,
  toggleBranchSchema,
} from "@/modules/branches/schema";
import { AuditAction, BranchStatus } from "@/app/generated/prisma/enums";

export type BranchFormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[] | undefined>;
    }
  | undefined;

// 每个动作的第一行都必须独立校验身份与能力，不依赖页面拦截
async function guard(): Promise<CurrentUser> {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  assertCanManageBranches(user);
  return user;
}

// Prisma 唯一约束冲突（P2002）→ 友好提示
function isUniqueConflict(e: unknown): boolean {
  return (e as { code?: string })?.code === "P2002";
}

export async function createBranchAction(
  _prevState: BranchFormState,
  formData: FormData
): Promise<BranchFormState> {
  const user = await guard();

  const parsed = createBranchSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const branch = await prisma.branch.create({ data: { name: parsed.data.name } });
    await writeAudit({
      actorId: user.id,
      action: AuditAction.BRANCH_CREATE,
      targetType: "Branch",
      targetId: branch.id,
      detail: { name: branch.name },
      ip: await getClientIp(),
    });
  } catch (e) {
    if (isUniqueConflict(e)) return { error: "分公司名称已存在" };
    console.error("创建分公司失败:", e);
    return { error: "创建失败，请稍后重试" };
  }

  redirect("/boss/branches");
}

export async function renameBranchAction(
  _prevState: BranchFormState,
  formData: FormData
): Promise<BranchFormState> {
  const user = await guard();

  const parsed = renameBranchSchema.safeParse({
    branchId: formData.get("branchId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const branch = await prisma.branch.findUnique({ where: { id: parsed.data.branchId } });
    if (!branch) return { error: "分公司不存在" };
    const updated = await prisma.branch.update({
      where: { id: branch.id },
      data: { name: parsed.data.name },
    });
    await writeAudit({
      actorId: user.id,
      action: AuditAction.BRANCH_UPDATE,
      targetType: "Branch",
      targetId: branch.id,
      detail: { name: { from: branch.name, to: updated.name } },
      ip: await getClientIp(),
    });
  } catch (e) {
    if (isUniqueConflict(e)) return { error: "分公司名称已存在" };
    console.error("重命名分公司失败:", e);
    return { error: "重命名失败，请稍后重试" };
  }

  redirect("/boss/branches");
}

// 启停动作：作为普通表单动作使用（签名只有 formData），成功即刷新列表页
export async function toggleBranchAction(formData: FormData): Promise<void> {
  const user = await guard();

  const parsed = toggleBranchSchema.safeParse({ branchId: formData.get("branchId") });
  if (!parsed.success) {
    redirect("/boss/branches");
  }

  const branch = await prisma.branch.findUnique({ where: { id: parsed.data.branchId } });
  if (!branch) {
    redirect("/boss/branches");
  }

  const next =
    branch.status === BranchStatus.ACTIVE ? BranchStatus.INACTIVE : BranchStatus.ACTIVE;
  await prisma.branch.update({ where: { id: branch.id }, data: { status: next } });
  await writeAudit({
    actorId: user.id,
    action: AuditAction.BRANCH_UPDATE,
    targetType: "Branch",
    targetId: branch.id,
    detail: { status: { from: branch.status, to: next } },
    ip: await getClientIp(),
  });

  redirect("/boss/branches");
}
