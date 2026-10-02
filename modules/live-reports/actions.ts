"use server";

import { recycleSchema, recycleLiveReport } from "./recycle-service";
import { redirect, RedirectType } from "next/navigation";
import { parseTrail, withTrail } from "@/lib/navigation-trail";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { getClientIp } from "@/lib/request-ip";
import { UserActionError } from "@/modules/users/boss-guard";
import { reportSchema, type ReportFormState } from "./schema";
import { saveLiveReport } from "./service";
import { monetizationSchema } from "./monetization-schema";
import { saveMonetization } from "./monetization-service";

export async function saveLiveReportAction(_state: ReportFormState, form: FormData): Promise<ReportFormState> {
  const actor = await requirePageUser();
  await requirePasswordChanged(actor);
  const token = await getCurrentSessionToken();
  if (!token) redirect("/login");
  const parsed = reportSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const ip = await getClientIp();
  let id: string;
  try {
    id = await prisma.$transaction((tx) => saveLiveReport(tx, token, parsed.data, ip));
  } catch (error) {
    if (error instanceof UserActionError) return { error: error.message };
    if ((error as { code?: string })?.code === "P2002") return { error: "该账号在此开播时间已有记录，请查看并修改已有记录" };
    console.error("保存直播数据失败");
    return { error: "保存失败，请稍后重试" };
  }
  revalidatePath("/live-reports", "layout");
  revalidatePath("/workbench", "layout");
  revalidatePath("/controller");
  if (form.get("embedded") === "true") return { success: "已保存本场数据" };
  redirect(withTrail(`/live-reports/${id}?saved=1`, parseTrail(form.get("via"))), RedirectType.replace);
}

export async function saveMonetizationAction(_state: ReportFormState, form: FormData): Promise<ReportFormState> {
  const actor = await requirePageUser();
  await requirePasswordChanged(actor);
  const token = await getCurrentSessionToken();
  if (!token) redirect("/login");
  const parsed = monetizationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const ip = await getClientIp();
  let id: string;
  try {
    id = await prisma.$transaction((tx) => saveMonetization(tx, token, parsed.data, ip));
  } catch (error) {
    if (error instanceof UserActionError) return { error: error.message };
    console.error("保存打粉数据失败");
    return { error: "保存失败，请稍后重试" };
  }
  revalidatePath("/live-reports", "layout");
  revalidatePath("/workbench", "layout");
  revalidatePath("/controller");
  if (form.get("embedded") === "true") return { success: "已保存本场数据" };
  redirect(withTrail(`/live-reports/${id}?saved=1#monetization`, parseTrail(form.get("via"))), RedirectType.replace);
}

export async function recycleLiveReportAction(_state: ReportFormState, form: FormData): Promise<ReportFormState> {
  const actor = await requirePageUser(); await requirePasswordChanged(actor);
  const token = await getCurrentSessionToken(); if (!token) redirect("/login");
  const parsed = recycleSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "请勾选确认，并核对操作内容" };
  const ip = await getClientIp();
  try { await prisma.$transaction(tx => recycleLiveReport(tx, token, parsed.data, ip)); }
  catch (error) { if (error instanceof UserActionError) return { error: error.message }; console.error("删除或恢复直播数据失败"); return { error: "操作失败，未提交更改，请稍后重试" }; }
  revalidatePath("/live-reports", "layout"); revalidatePath("/workbench", "layout"); revalidatePath("/controller");
  return { success: parsed.data.operation === "delete" ? "已移入回收站，可恢复" : "已恢复数据" };
}

export async function correctReportPeopleAction(_state: ReportFormState, form: FormData): Promise<ReportFormState> {
  const token=await getCurrentSessionToken();if(!token)return {error:"登录已失效"};
  const ip = await getClientIp();
  try {const {correctReportPeople}=await import("./service");await prisma.$transaction(tx=>correctReportPeople(tx,token,Object.fromEntries(form),ip));}
  catch(e){return {error:e instanceof UserActionError?e.message:"请检查人员与更正原因，未保存修改"};}
  revalidatePath("/live-reports","layout");revalidatePath("/settlements","layout");return {success:"已更正人员"};
}
