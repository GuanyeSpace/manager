import Link from "next/link";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { canViewLiveReports } from "@/lib/auth/live-report-permissions";
import { getWorkSession } from "@/modules/workbench/queries";
import { getReportAccountOptions } from "@/modules/live-reports/queries";
import { shanghaiInput } from "@/modules/live-reports/schema";
import { LiveReportForm } from "@/components/live-report-form";
import { LiveReportDetails } from "@/components/live-report-details";
export async function WorkSessionData({ id }: { id: string }) {
  const actor = await requirePageUser(); await requirePasswordChanged(actor);
  if (!canViewLiveReports(actor)) return null;
  const result = await getWorkSession(id);
  if (!result) return null;
  const s = result.session;
  if (s.leadEligible) return <Link href="/leads" className="text-sm underline">到导粉场次与数据页面处理 →</Link>;
  if (s.report) return <div className="min-w-0 space-y-5"><LiveReportDetails id={s.report.id} embedded /></div>;
  if (!result.editable || !s.startedAt || !s.endedAt) return <p className="text-sm text-muted-foreground">下播后在这里填写本场直播数据和打粉数据。</p>;
  const accounts = (await getReportAccountOptions()).filter(a => a.id === s.accountId);
  const seconds = Math.max(1, Math.floor((s.endedAt.getTime() - s.startedAt.getTime()) / 1000));
  return <><LiveReportForm embedded accounts={accounts} workDefaults={{ id, accountId: s.accountId, startedAt: shanghaiInput(s.startedAt), sessionLabel: s.label, durationHours: String(Math.floor(seconds / 3600)), durationMinutes: String(Math.floor(seconds % 3600 / 60)), durationSeconds: String(seconds % 60) }} /><p className="text-sm text-muted-foreground">保存直播数据后，下方会显示本场打粉表单，无需离开此页面。</p></>;
}
