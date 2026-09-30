import Link from "@/components/context-link";
import { notFound, redirect } from "next/navigation";
import { getWorkSession } from "@/modules/workbench/queries";
import { shanghaiInput } from "@/modules/live-reports/schema";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import { getReportAccountOptions } from "@/modules/live-reports/queries";
import { LiveReportForm } from "@/components/live-report-form";

export default async function NewLiveReportPage({ searchParams }: { searchParams: Promise<{ accountId?: string; workSessionId?: string }> }) {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  const accounts = await getReportAccountOptions();
  const { accountId, workSessionId } = await searchParams;
  let workDefaults;
  if (workSessionId) {
    const work = await getWorkSession(workSessionId);
    if (!work || !work.editable || !work.session.startedAt || !work.session.endedAt) notFound();
    if (work.session.report) redirect(`/live-reports/${work.session.report.id}`);
    const s = work.session, seconds = Math.max(1, Math.floor((s.endedAt!.getTime() - s.startedAt!.getTime()) / 1000));
    workDefaults = { id: s.id, accountId: s.accountId, startedAt: shanghaiInput(s.startedAt!), sessionLabel: s.label, durationHours: String(Math.floor(seconds / 3600)), durationMinutes: String(Math.floor(seconds % 3600 / 60)), durationSeconds: String(seconds % 60) };
  }
  const defaultAccountId = accounts.some((a) => a.id === accountId) ? accountId : accounts.length === 1 ? accounts[0].id : "";
  return <><h1 className="text-2xl font-semibold">录入本场直播数据</h1><p className="text-sm text-muted-foreground">先保存本场直播数据，随后填写打粉数据。已录入的场次请到“直播数据”中打开详情补填或更正，无需重复新增。</p>
    {accounts.length ? <LiveReportForm workDefaults={workDefaults} accounts={workDefaults ? accounts.filter(a => a.id === workDefaults.accountId) : accounts} defaultAccountId={defaultAccountId} boss={isAccountBoss(user)} /> : <>
      <p className="text-muted-foreground">暂无可录入账号。当前数据暂由老板录入，请确认账号及分公司已启用。</p><Link href="/live-reports">查看历史数据</Link>
    </>}
  </>;
}
