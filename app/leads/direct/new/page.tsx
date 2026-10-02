import Link from "@/components/context-link";
import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { readDirectOptions } from "@/modules/direct-leads/service";
import { DirectLeadCreate } from "@/components/direct-lead-create";
export default async function Page(){const token=await getCurrentSessionToken();if(!token)notFound();const d=await prisma.$transaction(tx=>readDirectOptions(tx,token),{isolationLevel:"RepeatableRead"});return <><Link href="/leads">← 返回导粉工作</Link><h1 className="text-2xl font-semibold">直接录入场次数据</h1><p className="text-sm text-slate-500">用于没有中控执行场次的外部主播直播。由你负责填报，不会创建中控场次或上班记录。</p><DirectLeadCreate {...d}/></>;}
