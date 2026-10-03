import { liveValues, readSessionLiveData } from "@/modules/reporting/service";
import { ReportingForm } from "@/components/reporting-form";
import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
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
  const { task: t, editable, manager, people, actualPeople, history } = result, s = t.session;
  const split=s.liveDataRole === "CONTROLLER";
  const live=split&&manager?await prisma.$transaction(async tx=>readSessionLiveData(tx,(await getCurrentSessionToken())??"",s.id)):null;
  return <><ReturnLink fallback="/leads" label="返回导粉工作台" /><header className="space-y-2"><h1 className="text-2xl font-semibold">{s.sourceRecord.name} · {s.label}</h1><p className="text-sm">{t.branch.name} · 本场实际导粉专员：{t.actualLeadName ?? t.userName} · 登录认领账号：{t.userName} · 主播：{s.actualAnchorName ?? s.sourceRecord.anchorName ?? "未记录"}</p><p className="text-sm text-slate-500">开播 {formatDateTime(s.startedAt!)} · {s.endedAt ? `下播 ${formatDateTime(s.endedAt)}` : "正在直播"} · {t.deletedAt ? "已删除" : t.completedAt ? "数据已完成" : "待填报 / 待补数据"}</p></header>
    <LeadDataForm id={id} version={t.version} initial={leadValues(split?{...leadValues(t.data),...liveValues(s.liveDataDraft)}:t.data)} liveReadOnly={split} completed={!!t.completedAt} editable={editable && !t.deletedAt} ended={!!s.endedAt && s.phase !== "LIVE" && (!split || !!s.liveDataSubmittedAt)} />
    {split&&!s.liveDataSubmittedAt&&<p>等待直播中控提交直播数据，打粉数据可先存草稿。</p>}{live&&<details className="rounded border p-4"><summary>管理人员更正直播数据</summary><ReportingForm id={s.id} version={live.version} initial={live.values} submitted={live.submitted} editable={live.editable} ended={live.ended}/><CorrectionHistory rows={live.history}/></details>}
    <HistoricalReportFields data={{ ...(t.data as Record<string, unknown>), ...(s.report ? { longPressCount: s.report.longPressCount ?? (t.data as Record<string,unknown>).longPressCount, hasSales: s.report.hasSales, salesGmv: s.report.salesGmv?.toString() } : {}) }} />
    {editable && t.userId === user.id && !t.completedAt && !t.deletedAt && <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm">撤销本场导粉</summary><div className="mt-3"><LeadCommandForm key={t.version} id={id} version={t.version} command="release" label="撤销本场导粉"><p className="text-sm">撤销后场次可被重新认领，原草稿留存历史。中控直播数据不受影响。</p><textarea name="reason" required maxLength={2000} placeholder="填写撤销原因" aria-label="撤销原因" className={leadInputClass}/></LeadCommandForm></div></details>}
    {manager && <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="font-semibold">负责人操作</h2>{!t.deletedAt && <details><summary className="cursor-pointer text-sm">更正实际导粉人员</summary><div className="mt-3"><LeadCommandForm key={t.version} id={id} version={t.version} command="correctActual" label="确认更正实际人员"><select name="actualLeadId" required defaultValue="" className={leadInputClass}><option value="" disabled>选择实际导粉人员</option>{actualPeople.filter(p=>p.id!==(t.actualLeadId??t.userId)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><textarea name="reason" required maxLength={2000} placeholder="填写更正原因" aria-label="实际人员更正原因" className={leadInputClass}/><p className="text-sm">只更正统计人员，不改变登录认领账号的填写权限。</p></LeadCommandForm></div></details>}{!t.deletedAt && <details><summary className="cursor-pointer text-sm">纠正登录认领账号</summary><div className="mt-3"><LeadCommandForm key={t.version} id={id} version={t.version} command="correctOwner" label="保存误认领纠正"><p className="text-sm text-slate-500">仅用于纠正认领错误，不用于中途交接。已填数据保留，原认领人不再拥有本场权限，实际导粉人员保持不变。</p><select name="userId" required defaultValue="" className={leadInputClass}><option value="" disabled>选择正确的登录认领账号</option>{people.filter(p => p.id !== t.userId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><textarea name="reason" required maxLength={2000} aria-label="纠正认领原因" placeholder="填写纠正原因" className={leadInputClass} /></LeadCommandForm></div></details>}
      <details><summary className="cursor-pointer text-sm">{t.deletedAt ? "恢复本场数据" : "将本场数据移入回收站"}</summary><div className="mt-3"><LeadCommandForm key={t.version} id={id} version={t.version} command={t.deletedAt ? "restore" : "delete"} label={t.deletedAt ? "确认恢复" : "确认移入回收站"}><p className="text-sm">直播中控的执行记录和认领关系保留，数据可恢复。</p><textarea name="reason" required maxLength={2000} aria-label="删除或恢复原因" placeholder="填写操作原因" className={leadInputClass} /></LeadCommandForm></div></details></section>}
    <details className="space-y-4 rounded-xl border bg-white p-5"><summary className="cursor-pointer font-semibold">认领与数据修改记录（{history.length}）</summary><CorrectionHistory rows={history} /></details></>;
}
