"use server";

import { redirect, RedirectType } from "next/navigation";
import { parseTrail, withTrail } from "@/lib/navigation-trail";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { getClientIp } from "@/lib/request-ip";
import { UserActionError } from "@/modules/users/boss-guard";
import { accountSchema, managerSchema, type AccountFormState } from "./schema";
import { saveAccount, setBranchManager } from "./service";

async function guard() {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  const token = await getCurrentSessionToken();
  if (!token) redirect("/login");
  return token;
}

function formError(error: unknown): AccountFormState {
  if (error instanceof UserActionError) return { error: error.message, fieldErrors: error.fieldErrors };
  if ((error as { code?: string })?.code === "P2002") return { error: "抖音号已存在，请检查后重试" };
  // 不输出包含实名、手机号等请求参数的数据库错误。
  console.error("账号管理操作失败");
  return { error: "保存失败，请稍后重试" };
}

export async function saveAccountAction(_state: AccountFormState, form: FormData): Promise<AccountFormState> {
  const token = await guard();
  const parsed = accountSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const ip = await getClientIp();
  let id: string;
  try {
    id = await prisma.$transaction((tx) => saveAccount(tx, token, parsed.data, ip));
  } catch (error) { return formError(error); }
  revalidatePath("/accounts", "layout");
  revalidatePath("/resources", "layout");
  revalidatePath("/workbench", "layout");
  revalidatePath("/controller");
  redirect(withTrail(`/accounts/${id}`, parseTrail(form.get("via"))), RedirectType.replace);
}

export async function setBranchManagerAction(_state: AccountFormState, form: FormData): Promise<AccountFormState> {
  const token = await guard();
  const parsed = managerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "表单无效，请刷新后重试" };
  const ip = await getClientIp();
  try {
    await prisma.$transaction((tx) => setBranchManager(tx, token, parsed.data, ip));
  } catch (error) { return formError(error); }
  revalidatePath("/accounts", "layout");
  revalidatePath("/boss/branches");
  redirect("/boss/branches");
}
