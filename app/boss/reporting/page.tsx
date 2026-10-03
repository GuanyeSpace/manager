import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { readReportingSetting } from "@/modules/reporting/service";
import { ReportingForm } from "@/components/reporting-form";
export default async function ReportingSettings(){const token=await getCurrentSessionToken();const setting=await prisma.$transaction(tx=>readReportingSetting(tx,token??""));return <><h1 className="text-2xl font-semibold">直播数据填写设置</h1><ReportingForm version={setting.version} role={setting.role}/></>;}
