"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { getClientIp } from "@/lib/request-ip";
import { UserActionError } from "@/modules/users/boss-guard";
import { ZodError } from "zod";
import { saveReportingSetting, saveSessionLiveData } from "./service";
export type ReportingState={error?:string;success?:string;savedVersion?:number};
export async function reportingAction(previous:ReportingState,form:FormData):Promise<ReportingState>{
 try{const token=await getCurrentSessionToken();if(!token)throw new UserActionError("登录已失效");const ip=await getClientIp();const raw=Object.fromEntries(form);
 const savedVersion=await prisma.$transaction(tx=>form.get("mode")==="setting"?saveReportingSetting(tx,token,raw,ip):saveSessionLiveData(tx,token,{...raw,data:raw},ip));
 for(const path of ["/boss","/workbench","/leads","/live-reports","/settlements"])revalidatePath(path,"layout");
 return{savedVersion,success:"已保存"};
 }catch(e){return{...previous,success:undefined,error:e instanceof UserActionError?e.message:e instanceof ZodError?e.issues.map(i=>i.message).join("；"):"保存失败，输入已保留，请稍后重试"};}
}
