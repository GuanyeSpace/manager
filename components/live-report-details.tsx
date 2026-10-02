import { ReportPeopleForm } from "./report-people-form";
import { HistoricalReportFields } from "./report-metric-sections";
import { CorrectionHistory } from "@/components/work-corrections";
import { monetizationFields } from "@/modules/live-reports/monetization-schema";
import { ReportRecycleForm } from "@/components/report-recycle-form";
import Link, { ReturnLink } from "@/components/context-link";
import { parseTrail, withTrail } from "@/lib/navigation-trail";
import { notFound, redirect } from "next/navigation";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getLiveReport } from "@/modules/live-reports/queries";
import { LiveReportTable } from "@/components/live-report-table";
import { LiveReportForm } from "@/components/live-report-form";
import { metricFields, shanghaiInput, type ReportInput } from "@/modules/live-reports/schema";
import { MonetizationTable } from "@/components/monetization-table";
import { MonetizationForm } from "@/components/monetization-form";
import { formatDateTime } from "@/lib/datetime";

export async function LiveReportDetails({ id, embedded = false, via }: { id: string; embedded?: boolean; via?: string }) {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  const data = await getLiveReport(id);
  if (!data) notFound();
  if (data.leadTaskId) redirect(withTrail(`/leads/${data.leadTaskId}`, parseTrail(via)));
  const { report: r } = data;
  const labels: Record<string, string> = Object.fromEntries([...metricFields, ...monetizationFields, ["femaleHundredths", "女性比例（百分之一百分点）"], ["age31To40Hundredths", "31–40岁比例（百分之一百分点）"], ["isLeadGeneration", "是否导粉"], ["durationSeconds", "直播时长（秒）"], ["sessionLabel", "场次"], ["averageStayHundredths", "人均停留（百分之一分钟）"], ["updatedByName", "修改人"], ["hasSales", "历史带货情况"], ["salesGmv", "历史带货GMV"]]);
  const history = <details className="space-y-3 rounded-xl border p-4"><summary className="cursor-pointer">数据修改记录</summary><CorrectionHistory rows={data.history.map(row => {
    const d = row.detail as { actorName?: string; reason?: string; operation?: string; before?: unknown; after?: unknown };
    const before = d.before && typeof d.before === "object" ? d.before as Record<string, unknown> : {};
    const after = d.after && typeof d.after === "object" ? d.after as Record<string, unknown> : {};
    const changes = d.operation ? [{ field: "数据状态", before: d.operation === "delete" ? "正常" : "回收站", after: d.operation === "delete" ? "回收站" : "正常" }] : Object.keys(after).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(key => ({ field: labels[key] ?? key, before: before[key] == null ? "未填写" : String(before[key]), after: after[key] == null ? "未填写" : String(after[key]) }));
    return { ...row, detail: { actorName: d.actorName ?? row.actor?.name, reason: d.reason ?? "历史未填写", changes } };
  })} /></details>;
  const canEdit = data.canEdit;
  const canEditMoney = data.canEditMonetization;
  if (r.deletedAt) return <section className="space-y-4 rounded-xl border p-5"><h2 className="font-semibold">本场直播数据已删除</h2><p className="text-sm text-muted-foreground">{r.accountName} · {formatDateTime(r.startedAt)} · 原始指标与工作流程记录仍保留，恢复后可以查看和修改。</p>{canEdit ? <ReportRecycleForm key={r.version} id={r.id} version={r.version} section="report" restore /> : <p className="text-sm">请联系老板恢复。</p>}<Link className="block text-sm text-primary" href="/live-reports?trash=true">查看回收站</Link>{history}</section>;
  const metrics = Object.fromEntries(metricFields.map(([key]) => [key, String(r[key])])) as Pick<ReportInput, typeof metricFields[number][0]>;
  return <>
    {!embedded && <ReturnLink fallback="/live-reports" label="返回直播数据" />}
    {!embedded && <div><h1 className="text-2xl font-semibold">{r.accountName} · {r.sessionLabel}</h1><p className="mt-1 text-sm text-muted-foreground">{formatDateTime(r.startedAt)} 开播 · 数据已保存</p></div>}
    {!embedded && r.workSessionId && <Link href={`/workbench/sessions/${r.workSessionId}`} className="text-sm text-primary">查看本场执行记录 →</Link>}
    {!embedded && <LiveReportTable reports={[r]} />}
    <p className="text-sm text-muted-foreground">录入：{r.createdByName}（{formatDateTime(r.createdAt)}） · 最近更新：{r.updatedByName}（{formatDateTime(r.updatedAt)}） · 版本 {r.version}</p>
    {r.historicalBackfill && <p className="rounded-lg bg-muted p-3 text-sm">此场早于账号建档时间，已由老板确认按建档时的分公司和人员归属补录。</p>}
    <section id="monetization" className="flex scroll-mt-6 flex-col gap-4">
      <h2 className="text-lg font-semibold">本场打粉数据</h2>
      <p className="text-sm text-muted-foreground">场观人数沿用本场进房人数。后端有效人数用于打粉结算。</p>
      {!r.monetizationDeletedAt && !embedded && <MonetizationTable reports={[r]} />}
      {r.monetizationDeletedAt ? <div className="space-y-3 rounded-lg border p-4"><p className="text-sm">本场打粉数据已删除，可恢复后更正。</p>{canEditMoney && <ReportRecycleForm key={r.version} id={r.id} version={r.version} section="monetization" restore />}</div> : canEditMoney ? <MonetizationForm entryCount={r.entryCount} embedded={embedded} initial={{
        leadMode: r.isLeadGeneration === null ? "" : r.isLeadGeneration ? "yes" : "no", reason: "", id: r.id, version: String(r.version), fanGroupCount: r.fanGroupCount?.toString() ?? "",
        linkClickCount: r.linkClickCount?.toString() ?? "", longPressCount: r.longPressCount?.toString() ?? "",
        backendJoinCount: r.backendJoinCount?.toString() ?? "", effectiveCount: r.effectiveCount?.toString() ?? "",
        salesStatus: r.hasSales === null ? "UNFILLED" : r.hasSales ? "REPORTED" : "NONE", salesGmv: r.salesGmv?.toFixed(2) ?? "",
      }} /> : <p className="text-sm text-muted-foreground">打粉数据仅可查看，如需补填或更正请联系老板。</p>}
      {!r.monetizationDeletedAt && r.monetizationUpdatedAt && canEditMoney && <ReportRecycleForm key={`money-${r.version}`} id={r.id} version={r.version} section="monetization" />}
    </section>
    {canEdit ? <><h2 className="text-lg font-semibold">更正数据</h2><LiveReportForm embedded={embedded} accounts={[{ id: r.accountId, name: r.accountName, douyinId: r.douyinId }]} initial={{
      ...metrics, femalePercent: r.femaleHundredths === null ? "" : String(r.femaleHundredths / 100), age31To40Percent: r.age31To40Hundredths === null ? "" : String(r.age31To40Hundredths / 100), reason: "", id: r.id, version: String(r.version), accountId: r.accountId, startedAt: shanghaiInput(r.originalStartedAt),
      durationHours: String(Math.floor(r.durationSeconds / 3600)), durationMinutes: String(Math.floor(r.durationSeconds % 3600 / 60)), durationSeconds: String(r.durationSeconds % 60),
      sessionLabel: r.sessionLabel, averageStayMinutes: String(r.averageStayHundredths / 100), confirmBackfill: "false",
    }} /></> : <p className="text-sm text-muted-foreground">此记录仅可查看。如需纠错，请联系老板。</p>}
    <HistoricalReportFields data={{ longPressCount: r.longPressCount, hasSales: r.hasSales, salesGmv: r.salesGmv?.toString() }} />
    {data.people.length>0 && <ReportPeopleForm key={`people-${r.version}`} report={r} people={data.people}/>}
    {history}
    {canEdit && <ReportRecycleForm key={`report-${r.version}`} id={r.id} version={r.version} section="report" />}
  </>;
}
