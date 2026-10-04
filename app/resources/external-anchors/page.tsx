import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { readExternalAnchors } from "@/modules/external-anchors/service";
import { ExternalAnchorForm } from "@/components/external-anchor-form";
import { requirePageUser } from "@/lib/auth/permissions";
import { isAccountBoss } from "@/lib/auth/account-permissions";
export default async function Page(){
 const user=await requirePageUser();if(!isAccountBoss(user))notFound();
 const token=await getCurrentSessionToken();if(!token)notFound();const d=await prisma.$transaction(tx=>readExternalAnchors(tx,token),{isolationLevel:"RepeatableRead"});
 return <><h1 className="text-2xl font-semibold">外部主播</h1><details className="rounded border p-4"><summary>新增外部主播</summary><ExternalAnchorForm/></details><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">姓名 / 昵称</th><th className="p-3">抖音账号</th><th className="p-3">备注</th><th className="p-3">操作</th></tr></thead><tbody>{d.rows.map(r=><tr key={`${r.id}:${r.version}`} className="border-b align-top"><td className="p-3">{r.name}{!r.active&&"（已停用）"}</td><td className="p-3">{r.accounts.map(a=><p key={a.id}>{a.name} · {a.douyinId}{!a.active&&"（已停用）"}</p>)}</td><td className="whitespace-pre-wrap p-3">{r.notes||"—"}</td><td className="space-y-3 p-3"><details><summary>编辑</summary><ExternalAnchorForm initial={r}/></details><details><summary>{r.active?"停用":"启用"}</summary><ExternalAnchorForm initial={r} toggle/></details></td></tr>)}</tbody></table>{!d.rows.length&&<p className="p-4 text-slate-500">暂无外部主播</p>}</div></>;
}
