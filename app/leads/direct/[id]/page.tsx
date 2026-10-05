import { displaySessionLabel } from "@/lib/session-label";
import { ReturnLink } from "@/components/context-link";
import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { readDirectTask } from "@/modules/direct-leads/service";
import { LeadDataForm,LeadCommandForm,leadInputClass } from "@/components/lead-form";
import { leadValues } from "@/modules/leads/schema";
import { formatDateTime } from "@/lib/datetime";
export default async function Page({params}:{params:Promise<{id:string}>}){
 const token=await getCurrentSessionToken();if(!token)notFound();const {id}=await params;const d=await prisma.$transaction(tx=>readDirectTask(tx,token,id),{isolationLevel:"RepeatableRead"});if(!d)notFound();const t=d.task;
 return <><ReturnLink fallback="/leads" label="返回导粉工作"/><h1 className="text-2xl font-semibold">{t.sourceRecord.name} · {displaySessionLabel(t.label, t.startedAt)}</h1><p className="text-sm">直接录入 · 主播：{t.anchorName}（外部） · 直播中控：未安排 · 导粉专员：{t.userName}</p><p className="text-sm text-slate-500">{formatDateTime(t.startedAt)} 开播 · {t.sourceRecord.branchName} · {t.deletedAt?"回收站":t.completedAt?"已完成":"待填报"}</p><LeadDataForm source="direct" id={t.id} version={t.version} initial={leadValues(t.data)} completed={!!t.completedAt} editable={d.editable&&!t.deletedAt} ended/>{d.manager&&<details className="rounded border p-4"><summary>管理记录</summary><div className="mt-4 space-y-6"><LeadCommandForm source="direct" id={t.id} version={t.version} command={t.deletedAt?"restore":"delete"} label={t.deletedAt?"恢复":"移入回收站"}><textarea name="reason" required maxLength={2000} placeholder="操作原因" className={leadInputClass}/></LeadCommandForm>{!t.deletedAt&&<LeadCommandForm source="direct" id={t.id} version={t.version} command="correctOwner" label="纠正负责人"><select name="userId" required className={leadInputClass}><option value="">请选择导粉专员</option>{d.people.filter(p=>p.id!==t.userId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><textarea name="reason" required maxLength={2000} placeholder="纠正原因" className={leadInputClass}/></LeadCommandForm>}</div></details>}<details className="rounded border p-4"><summary>修改历史</summary>{d.history.map(h=><div key={h.id} className="border-b py-3"><p>{formatDateTime(h.createdAt)}</p><pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(h.detail,null,2)}</pre></div>)}</details></>;
}
