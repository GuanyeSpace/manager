"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { getClientIp } from "@/lib/request-ip";
import { UserActionError } from "@/modules/users/boss-guard";
import { copyWorkflow, saveDailyWork, saveWorkflow } from "./service";
import { submitWorkCommand } from "./screenshots";
import { saveSessionScripts } from "./session-scripts";
import { runShiftCommand } from "./shifts";
import type { WorkState } from "./schema";
async function guard() { const user = await requirePageUser(); await requirePasswordChanged(user); const token = await getCurrentSessionToken(); if (!token) redirect("/login"); return token; }
function errorState(error: unknown): WorkState {
  if (error instanceof UserActionError) return { error: error.message };
  if (error instanceof z.ZodError || error instanceof SyntaxError) return { error: "请检查必填项、文字长度和时间格式" };
  if ((error as { code?: string })?.code === "P2002") return { error: "该直播中控或账号已有进行中的场次，请刷新后继续" };
  console.error("工作台保存失败"); return { error: "保存失败，请稍后重试" };
}
function refresh() { revalidatePath("/workbench", "layout"); revalidatePath("/controller"); revalidatePath("/account-config", "layout"); }
export async function workCommandAction(_state: WorkState, form: FormData): Promise<WorkState> {
  const token = await guard(), ip = await getClientIp(); let id: string;
  try { id = await submitWorkCommand(prisma, token, form, ip); } catch (error) { return { ...errorState(error), savedVersion: _state?.savedVersion }; }
  refresh();
  if (form.get("command") === "create") redirect(`/workbench/accounts/${encodeURIComponent(String(form.get("id")))}?sessionId=${id}`);
  return { success: "已保存", ...(form.get("command") === "correct" ? { savedVersion: Number(form.get("version")) + 1 } : {}) };
}
export async function saveWorkflowAction(_state: WorkState, form: FormData): Promise<WorkState> {
  const token = await guard(), ip = await getClientIp();
  try { await prisma.$transaction(tx => saveWorkflow(tx, token, String(form.get("accountId")), Number(form.get("version")), JSON.parse(String(form.get("content"))), ip, form.get("mode") === "scripts")); } catch (error) { return { ...errorState(error), savedVersion: _state?.savedVersion }; }
  refresh(); return { success: "已保存，新场次将使用此版本", savedVersion: Number(form.get("version")) + 1 };
}
export async function dailyWorkAction(_state: WorkState, form: FormData): Promise<WorkState> {
  const token = await guard(), ip = await getClientIp();
  try { await prisma.$transaction(tx => saveDailyWork(tx, token, Number(form.get("index")), String(form.get("status")), ip)); } catch (error) { return errorState(error); }
  refresh(); return { success: "已保存" };
}

export async function copyWorkflowAction(_state: WorkState, form: FormData): Promise<WorkState> {
  const token = await guard(), ip = await getClientIp();
  let count: number;
  try { count = await prisma.$transaction(tx => copyWorkflow(tx, token, JSON.parse(String(form.get("content"))), ip), { timeout: 30000 }); }
  catch (error) { return errorState(error); }
  refresh(); return { success: `已应用到 ${count} 个账号，各账号可继续独立调整` };
}

export async function shiftCommandAction(_state: WorkState, form: FormData): Promise<WorkState> {
  const token = await guard(), ip = await getClientIp();
  try { await prisma.$transaction(tx => runShiftCommand(tx, token, Object.fromEntries(form), ip)); }
  catch (error) { return { ...errorState(error), savedVersion: _state?.savedVersion }; }
  refresh(); return { success: "已保存", ...(String(form.get("command")).startsWith("shiftCorrect") ? { savedVersion: Number(form.get("version")) + 1 } : {}) };
}

export async function saveSessionScriptsAction(_state: WorkState, form: FormData): Promise<WorkState> {
  const token = await guard(), ip = await getClientIp();
  try { await prisma.$transaction(tx => saveSessionScripts(tx, token, String(form.get("sessionId")), Number(form.get("sessionVersion")), Number(form.get("version")), JSON.parse(String(form.get("content"))), ip)); }
  catch (error) { return { ...errorState(error), savedVersion: _state?.savedVersion }; }
  refresh(); return { success: "已更新本场及账号话术，下一场也会沿用", savedVersion: Number(form.get("version")) + 1 };
}

// 检查清单返回事务内保存后的快照，下一项使用最新版本串行提交。
export async function saveShiftCheckAction(form: FormData): Promise<{ error?: string; saved?: { version: number; checks: import("./schema").EquipmentChecks; checkedInAt: string | null } }> {
  const token = await guard(), ip = await getClientIp();
  try {
    const saved = await prisma.$transaction(async tx => {
      const id = await runShiftCommand(tx, token, { ...Object.fromEntries(form), command: "shiftCheck" }, ip);
      const row = await tx.workShift.findUniqueOrThrow({ where: { id } });
      return { version: row.version, checks: row.checks as import("./schema").EquipmentChecks, checkedInAt: row.checkedInAt?.toISOString() ?? null };
    });
    refresh(); return { saved };
  } catch (error) { return { error: errorState(error)?.error ?? "保存失败，请重试" }; }
}
