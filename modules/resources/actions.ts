"use server";
import { redirect, RedirectType } from "next/navigation";
import { parseTrail, withTrail } from "@/lib/navigation-trail";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { getClientIp } from "@/lib/request-ip";
import { UserActionError } from "@/modules/users/boss-guard";
import { createIndividualMaterials, splitMaterial, saveResource } from "./service";
import { isResourceKind, type ResourceState } from "./schema";
export async function saveResourceAction(_state: ResourceState, form: FormData): Promise<ResourceState> {
  const actor = await requirePageUser(); await requirePasswordChanged(actor);
  const token = await getCurrentSessionToken(); if (!token) redirect("/login");
  const kind = String(form.get("kind")); if (!isResourceKind(kind)) return { error: "资料类型无效" };
  const ip = await getClientIp(); let id: string;
  try { id = await prisma.$transaction(tx => { const data = { ...Object.fromEntries(form), anchorIds: form.getAll("anchorIds"), ...(kind === "phones" ? { loginAccountIds: form.getAll("loginAccountIds") } : {}) }; return kind === "materials" && form.get("registration") === "individual" ? createIndividualMaterials(tx, token, data, ip) : saveResource(tx, token, kind, data, ip); }, { timeout: 30000 }); }
  catch (error) {
    if (error instanceof UserActionError) return { error: error.message };
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "请核对填写内容" };
    if ((error as { code?: string })?.code === "P2002") return { error: "号码、编号或同公司直播间名称已存在，或手机号已被其他手机占用" };
    console.error("资料维护失败"); return { error: "保存失败，请稍后重试" };
  }
  revalidatePath("/resources", "layout"); revalidatePath("/accounts", "layout"); revalidatePath("/workbench", "layout"); revalidatePath("/controller");
  redirect(withTrail(`/resources/${kind}/${id}`, parseTrail(form.get("via"))), RedirectType.replace);
}

export async function splitMaterialAction(_state: ResourceState, form: FormData): Promise<ResourceState> {
  const actor = await requirePageUser(); await requirePasswordChanged(actor);
  const token = await getCurrentSessionToken(); if (!token) redirect("/login");
  const id = String(form.get("id")), version = Number(form.get("version")), ip = await getClientIp();
  if (form.get("confirmed") !== "yes") return { error: "请核对单件编号并确认拆分" };
  try { await prisma.$transaction(tx => splitMaterial(tx, token, id, version, ip), { timeout: 30000 }); }
  catch (error) { if (error instanceof UserActionError) return { error: error.message }; return { error: "拆分失败，未提交本次拆分，请刷新后重试" }; }
  revalidatePath("/resources", "layout"); revalidatePath("/workbench", "layout");
  redirect(withTrail(`/resources/materials/${id}`, parseTrail(form.get("via"))), RedirectType.replace);
}
