import { HistoricalReportFields } from "@/components/report-metric-sections";
import { ReturnLink } from "@/components/context-link";
import { notFound } from "next/navigation";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getLeadTask } from "@/modules/leads/queries";
import { leadValues } from "@/modules/leads/schema";
import { LeadDataForm, LeadCommandForm } from "@/components/lead-form";
import { CorrectionHistory } from "@/components/work-corrections";
import { formatDateTime } from "@/lib/datetime";
const leadInputClass = "w-full rounded-lg border bg-white px-3 py-2 text-sm";
export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  const { id } = await params, result = await getLeadTask(id);
  if (!result) notFound();
  const { task: t, editable, manager, people, history } = result, s = t.session;
  return <><ReturnLink fallback="/leads" label="返回导粉工作台" /><header className="space-y-2"><h1 className="text-2xl font-semibold">{s.sourceRecord.name} · {s.label}</h1><p className="text-sm">{t.branch.name} · 本场导粉专员：{t.userName} · 主播：{s.sourceRecord.anchorName ?? "未记录"}</p><p className="text-sm text-slate-500">开播 {formatDateTime(s.startedAt!)} · {s.endedAt ? `下播 ${formatDateTime(s.endedAt)}` : "正在直播"} · {t.deletedAt ? "已删除" : t.completedAt ? "数据已完成" : "待填报 / 待补数据"}</p></header>
    <LeadDataForm id={id} version={t.version} initial={leadValues(t.data)} completed={!!t.completedAt} editable={editable && !t.deletedAt} ended={!!s.endedAt && s.phase !== "LIVE"} />
    <HistoricalReportFields data={{ ...(t.data as Record<string, unknown>), ...(s.report ? { longPressCount: s.report.longPressCount ?? (t.data as Record<string,unknown>).longPressCount, hasSales: s.report.hasSales, salesGmv: s.report.salesGmv?.toString() } : {}) }} />
    {manager && <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="font-semibold">负责人操作</h2>{!t.deletedAt && <details><summary className="cursor-pointer text-sm">纠正误认领</summary><div className="mt-3"><LeadCommandForm id={id} version={t.version} command="correctOwner" label="保存误认领纠正"><p className="text-sm text-slate-500">仅用于纠正认领错误，不用于中途交接。已填数据保留，原认领人不再拥有本场权限。</p><select name="userId" required defaultValue="" className={leadInputClass}><option value="" disabled>选择正确的导粉专员</option>{people.filter(p => p.id !== t.userId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><textarea name="reason" required maxLength={2000} aria-label="纠正认领原因" placeholder="填写纠正原因" className={leadInputClass} /></LeadCommandForm></div></details>}
      <details><summary className="cursor-pointer text-sm">{t.deletedAt ? "恢复本场数据" : "将本场数据移入回收站"}</summary><div className="mt-3"><LeadCommandForm id={id} version={t.version} command={t.deletedAt ? "restore" : "delete"} label={t.deletedAt ? "确认恢复" : "确认移入回收站"}><p className="text-sm">直播中控的执行记录和认领关系保留，数据可恢复。</p><textarea name="reason" required maxLength={2000} aria-label="删除或恢复原因" placeholder="填写操作原因" className={leadInputClass} /></LeadCommandForm></div></details></section>}
    <details className="space-y-4 rounded-xl border bg-white p-5"><summary className="cursor-pointer font-semibold">认领与数据修改记录（{history.length}）</summary><CorrectionHistory rows={history} /></details></>;
}
