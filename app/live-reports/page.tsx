import Link, { NavigationFields } from "@/components/context-link";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { listLiveReports } from "@/modules/live-reports/queries";
import { reportFilterSchema } from "@/modules/live-reports/schema";
import { MonetizationTable } from "@/components/monetization-table";
import { LiveReportTable } from "@/components/live-report-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function LiveReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  const params = await searchParams;
  const monetization = params.view === "monetization";
  const title = monetization ? "打粉数据" : "直播数据";
  const parsed = reportFilterSchema.safeParse(params);
  if (!parsed.success) return <><h1 className="text-2xl font-semibold">{title}</h1><p role="alert">筛选条件无效，请检查日期范围。</p><Link href={monetization ? "/live-reports?view=monetization" : "/live-reports"}>清除筛选</Link></>;
  const filters = parsed.data;
  const trash = filters.trash === "true";
  const data = await listLiveReports(filters);
  const pageUrl = (page: number) => `/live-reports?${new URLSearchParams({ trash: String(trash), view: monetization ? "monetization" : "performance", accountId: filters.accountId, from: filters.from, to: filters.to, page: String(page) })}`;
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">每场结束后人工填写，按开播时间从新到旧展示。</p></div>
      {!trash && data.canCreate && <Button asChild><Link href={`/live-reports/new${filters.accountId ? `?accountId=${encodeURIComponent(filters.accountId)}` : ""}`}>录入本场数据</Link></Button>}
    </div>
    <nav aria-label="数据类型" className="flex gap-4 text-sm">
      <Link className={!monetization ? "font-semibold underline underline-offset-4" : "text-muted-foreground"} href={`/live-reports?${new URLSearchParams({ trash: String(trash), accountId: filters.accountId, from: filters.from, to: filters.to })}`}>直播间数据</Link>
      <Link className={monetization ? "font-semibold underline underline-offset-4" : "text-muted-foreground"} href={`/live-reports?${new URLSearchParams({ trash: String(trash), view: "monetization", accountId: filters.accountId, from: filters.from, to: filters.to })}`}>打粉数据</Link>
      <Link className="ml-auto underline underline-offset-4" href={`/live-reports?${new URLSearchParams({ view: monetization ? "monetization" : "performance", trash: String(!trash), accountId: filters.accountId, from: filters.from, to: filters.to })}`}>{trash ? "返回正常数据" : "回收站"}</Link>
    </nav>
    {trash && <p className="rounded-lg bg-muted p-3 text-sm">回收站：已删除的数据保留在这里，具有维护权限的人员可恢复。</p>}
    <form method="GET" action="/live-reports" className="flex flex-wrap items-end gap-3">
      <NavigationFields /><input type="hidden" name="trash" value={String(trash)} />
      <input type="hidden" name="view" value={monetization ? "monetization" : "performance"} />
      <label className="flex min-w-0 max-w-full flex-col gap-1 text-sm">抖音账号<select name="accountId" defaultValue={filters.accountId} className="h-9 min-w-0 max-w-full rounded-lg border px-2">
        <option value="">全部可见账号</option>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.douyinId}</option>)}
      </select></label>
      <label className="flex flex-col gap-1 text-sm">开始日期<Input type="date" name="from" defaultValue={filters.from} /></label>
      <label className="flex flex-col gap-1 text-sm">结束日期<Input type="date" name="to" defaultValue={filters.to} /></label>
      <Button type="submit" variant="secondary">筛选</Button><Link href={monetization ? "/live-reports?view=monetization" : "/live-reports"} className="pb-2 text-sm text-muted-foreground">清除筛选</Link>
    </form>
    <p className="text-sm text-muted-foreground">共 {data.count} 场 · {monetization ? "场观人数沿用进房人数 · 未填写不等于零 · GMV 不等于实际收入" : "进房率 = 进房人数 ÷ 曝光人数 · 新增率 = 新增粉丝 ÷ 进房人数"}</p>
    {monetization ? <MonetizationTable reports={data.reports} /> : <LiveReportTable reports={data.reports} />}
    <nav aria-label="分页" className="flex items-center justify-between text-sm">
      {data.page > 1 ? <Link href={pageUrl(data.page-1)}>← 上一页</Link> : <span />}
      <span>第 {data.page} / {data.pages} 页</span>{data.page < data.pages ? <Link href={pageUrl(data.page+1)}>下一页 →</Link> : <span />}
    </nav>
  </>;
}
