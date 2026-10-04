"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { getClientIp } from "@/lib/request-ip";
import { UserActionError } from "@/modules/users/boss-guard";
import { externalAnchorSchema, saveExternalAnchor } from "./service";
export async function externalAnchorAction(_: {error?:string;success?:string}, form: FormData): Promise<{error?:string;success?:string}> {
  const token=await getCurrentSessionToken();if(!token)return {error:"登录已失效"};
  let accounts;try { accounts=form.get("accounts") ? JSON.parse(String(form.get("accounts"))) : undefined; } catch { return {error:"账号数据格式不正确"}; }
  const parsed=externalAnchorSchema.safeParse({...Object.fromEntries(form),accounts});if(!parsed.success)return {error:parsed.error.issues.map(i=>i.message).join("；")};
  try {const ip=await getClientIp();await prisma.$transaction(tx=>saveExternalAnchor(tx,token,parsed.data,ip));revalidatePath("/resources/external-anchors");revalidatePath("/accounts","layout");return {success:"已保存"};}
  catch(e){return {error:e instanceof UserActionError?e.message:"保存失败，输入已保留，请稍后重试"};}
}
