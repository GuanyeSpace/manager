"use server";
import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { getClientIp } from "@/lib/request-ip";
import { revalidatePath } from "next/cache";
import { UserActionError } from "@/modules/users/boss-guard";
import { createDirectTask,directCreateSchema } from "./service";
export async function createDirectAction(_: {error?:string;id?:string},form:FormData):Promise<{error?:string;id?:string}>{
 const token=await getCurrentSessionToken();if(!token)return {error:"登录已失效"};const parsed=directCreateSchema.safeParse(Object.fromEntries(form));if(!parsed.success)return {error:parsed.error.issues.map(i=>i.message).join("；")};
 try{const ip=await getClientIp();const id=await prisma.$transaction(tx=>createDirectTask(tx,token,parsed.data,ip));revalidatePath("/leads","layout");return {id};}catch(e){return {error:e instanceof UserActionError?e.message:"建档失败，输入已保留，请稍后重试"};}
}
