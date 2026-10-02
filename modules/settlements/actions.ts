"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { getClientIp } from "@/lib/request-ip";
import { UserActionError } from "@/modules/users/boss-guard";
import { saveBackend,saveConfirmed,recycleConfirmed } from "./service";
export type SettlementState={error?:string;success?:string;id?:string};
export async function settlementAction(_state:SettlementState,form:FormData):Promise<SettlementState> {
  const token=await getCurrentSessionToken();if(!token)return {error:"登录已失效，请重新登录"};
  try{const raw=Object.fromEntries(form),ip=await getClientIp();
    const id=await prisma.$transaction(tx=>form.get("kind")==="backend"?saveBackend(tx,token,raw,ip):form.get("kind")==="recycle"?recycleConfirmed(tx,token,raw,ip):saveConfirmed(tx,token,raw,ip));
    revalidatePath("/settlements","layout");revalidatePath("/anchor");return {id,success:"已保存"};
  }catch(e){if(e instanceof UserActionError)return {error:e.message};if(e instanceof z.ZodError)return {error:e.issues.map(i=>i.message).join("；")};if((e as {code?:string}).code==="P2002")return {error:"已有同名后端或同日期、主播、后端的记录，请核对后编辑原记录"};console.error("确定打粉数据保存失败");return {error:"保存失败，未提交更改，请稍后重试"};}
}
