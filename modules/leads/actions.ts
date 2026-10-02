"use server";
import { revalidatePath } from "next/cache";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { getClientIp } from "@/lib/request-ip";
import { prisma } from "@/lib/db";
import { UserActionError } from "@/modules/users/boss-guard";
import { leadCommandSchema, activeLeadFields } from "./schema";
import { runDirectCommand } from "@/modules/direct-leads/service";
import { runLeadCommand } from "./service";
export type LeadActionState = { error?: string; success?: string; id?: string; savedVersion?: number };
export async function leadAction(previous: LeadActionState, form: FormData): Promise<LeadActionState> {
  const token = await getCurrentSessionToken();
  if (!token) return { ...previous, success: undefined, error: "登录已失效，请重新登录" };
  const values = Object.fromEntries(form);
  const parsed = leadCommandSchema.safeParse({ ...values, ...(["save", "complete"].includes(String(values.command)) ? { data: Object.fromEntries(activeLeadFields.map(([key]) => [key, form.get(key) ?? ""])) } : {}) });
  if (!parsed.success) return { ...previous, success: undefined, error: parsed.error.issues.map(i => i.message).join("；") };
  try {
    const ip = await getClientIp();
    const id = await prisma.$transaction(tx => (form.get("source") === "direct" ? runDirectCommand : runLeadCommand)(tx, token, parsed.data, ip));
    revalidatePath("/settlements", "layout"); revalidatePath("/leads", "layout"); revalidatePath("/live-reports", "layout");
    return { id, savedVersion: parsed.data.version + 1, success: parsed.data.command === "complete" ? "已提交完成" : "已保存" };
  } catch (error) {
    return { ...previous, success: undefined, error: error instanceof UserActionError ? error.message : (error as { code?: string }).code === "P2002" ? "本场已有认领或数据，请刷新核对" : "保存失败，未提交更改，请稍后重试" };
  }
}
