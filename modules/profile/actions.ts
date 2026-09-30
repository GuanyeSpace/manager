"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { getClientIp } from "@/lib/request-ip";
import { UserActionError } from "@/modules/users/boss-guard";
import { profileSchema, type ProfileState } from "./schema";
import { saveOwnProfile } from "./service";
export async function saveProfileAction(previous: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  const token = await getCurrentSessionToken(); if (!token) redirect("/login");
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message, version: previous?.version };
  const ip = await getClientIp();
  try {
    const version = await prisma.$transaction(tx => saveOwnProfile(tx, token, parsed.data, ip));
    revalidatePath("/controller/profile");
    return { success: "个人资料已保存", version };
  } catch (error) {
    return { error: error instanceof UserActionError ? error.message : "保存失败，请稍后重试", version: previous?.version };
  }
}
