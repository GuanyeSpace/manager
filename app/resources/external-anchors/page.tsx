import Link from "@/components/context-link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { readExternalAnchors } from "@/modules/external-anchors/service";
import { ExternalAnchorForm } from "@/components/external-anchor-form";
export default async function Page(){
 const token=await getCurrentSessionToken();if(!token)notFound();const d=await prisma.$transaction(tx=>readExternalAnchors(tx,token),{isolationLevel:"RepeatableRead"});if(!d.branches.length)notFound();
 return <><Link href="/resources/anchors">← 主播管理</Link><h1 className="text-2xl font-semibold">外部主播</h1><p className="text-sm text-slate-500">无员工登录账号。历史记录保留原姓名，停用后不能新增填报。</p><details className="rounded border p-4"><summary>新增外部主播</summary><ExternalAnchorForm branches={d.branches}/></details>{d.rows.map(r=><section key={r.id} className="rounded border p-4"><h2 className="font-semibold">{r.name} · {r.branch.name} · {r.active?"启用":"停用"}</h2><details className="mt-3"><summary>编辑资料</summary><ExternalAnchorForm key={r.version} branches={d.branches} initial={r}/></details></section>)}</>;
}
