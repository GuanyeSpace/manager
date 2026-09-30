import Link from "@/components/context-link";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getWorkHistory } from "@/modules/workbench/queries";
import { workStatusLabel } from "@/modules/workbench/schema";
export default async function WorkHistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  const params = await searchParams, page = Math.max(1, Math.min(100000, Math.trunc(Number(params.page) || 1)));
  const sessions = await getWorkHistory(page);
  return <><h1 className="text-2xl font-semibold">场次执行记录</h1><p className="text-sm text-muted-foreground">保留本场的流程、话术、当时负责人和执行记录。</p><div className="space-y-3">{sessions.map(s => <Link key={s.id} href={`/workbench/sessions/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-5 hover:bg-muted/50"><div><p className="font-medium">{s.sourceRecord.name} · {s.label}</p><p className="mt-1 text-xs text-muted-foreground">{s.sourceRecord.branchName} · 本场直播中控 {s.actualControllerName ?? s.sourceRecord.controllerName} · {s.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p></div><span className="text-sm">{workStatusLabel(s)} →</span></Link>)}{!sessions.length && <p>暂无记录</p>}</div><nav className="flex gap-4 text-sm">{page > 1 && <Link href={`?page=${page - 1}`}>上一页</Link>}<span>第 {page} 页</span>{sessions.length === 30 && <Link href={`?page=${page + 1}`}>下一页</Link>}</nav></>;
}
