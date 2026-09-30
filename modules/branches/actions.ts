"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  requirePageUser,
  requirePasswordChanged,
  assertCanManageBranches,
} from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { mutateBranch } from "./service";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { UserActionError } from "@/modules/users/boss-guard";
import { getClientIp } from "@/lib/request-ip";
import {
  createBranchSchema,
  renameBranchSchema,
  toggleBranchSchema,
} from "@/modules/branches/schema";


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
  await guard();
  const token = await getCurrentSessionToken();
  if (!token) redirect("/login");

  const parsed = createBranchSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const ip = await getClientIp();
    await prisma.$transaction(tx => mutateBranch(tx, token, "create", parsed.data, ip));
  } catch (e) {
    if (e instanceof UserActionError) return { error: e.message };
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
  await guard();
  const token = await getCurrentSessionToken();
  if (!token) redirect("/login");

  const parsed = renameBranchSchema.safeParse({
    branchId: formData.get("branchId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const ip = await getClientIp();
    await prisma.$transaction(tx => mutateBranch(tx, token, "rename", parsed.data, ip));
  } catch (e) {
    if (e instanceof UserActionError) return { error: e.message };
    if (isUniqueConflict(e)) return { error: "分公司名称已存在" };
    console.error("重命名分公司失败:", e);
    return { error: "重命名失败，请稍后重试" };
  }

  redirect("/boss/branches");
}

// 启停动作：作为普通表单动作使用（签名只有 formData），成功即刷新列表页
export async function toggleBranchAction(formData: FormData): Promise<void> {
  await guard();
  const token = await getCurrentSessionToken();
  if (!token) redirect("/login");

  const parsed = toggleBranchSchema.safeParse({ branchId: formData.get("branchId") });
  if (!parsed.success) {
    redirect("/boss/branches");
  }

  const ip = await getClientIp();
  try {
    await prisma.$transaction(tx => mutateBranch(tx, token, "toggle", parsed.data, ip));
  } catch (error) {
    if (!(error instanceof UserActionError)) throw error;
    redirect("/boss/branches");
  }

  redirect("/boss/branches");
}
