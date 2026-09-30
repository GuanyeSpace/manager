import Link from "@/components/context-link";
import { listNumbers } from "@/modules/resources/queries";
import { numberStatuses, type NumberFilters } from "@/modules/resources/schema";
const cell = "whitespace-nowrap px-4 py-4";
const control = "min-w-0 rounded-lg border bg-background px-3 py-2 text-sm";
export async function NumberDirectory({ q, page, filters, pageSize }: { q: string; page: number; pageSize: number; filters: Partial<NumberFilters> }) {
  const data = await listNumbers(q, page, filters, pageSize);
  function pageHref(page: number) { return `?${new URLSearchParams({ q, ...data.filters, pageSize: String(data.pageSize), page: String(page) })}`; }
  return <>
    <header className="flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold">手机号管理</h1>{data.manager && <Link className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground" href="/resources/numbers/new">新增手机号</Link>}</header>
    <p className="text-sm text-muted-foreground">点击手机号查看套餐、所在手机及关联资料。每页显示 {data.pageSize} 条。</p>
    <form key={`${q}-${JSON.stringify(data.filters)}-${data.pageSize}`} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 xl:grid-cols-5">
      <label className="grid gap-2 text-sm">搜索<input name="q" defaultValue={q} maxLength={100} placeholder="手机号、账号或用途" className={control} /></label>
      <label className="grid gap-2 text-sm">开户人<input name="openedBy" defaultValue={data.filters.openedBy} maxLength={100} placeholder="输入开户人姓名" className={control} /></label>
      <label className="grid gap-2 text-sm">使用人<select name="userId" defaultValue={data.filters.userId} className={control}><option value="">全部使用人</option><option value="unassigned">暂未分配</option>{data.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm">状态<select name="status" defaultValue={data.filters.status} className={control}><option value="">全部状态</option>{Object.entries(numberStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-2 text-sm">每页显示<select name="pageSize" defaultValue={data.pageSize} className={control}>{[10,20,50].map(size => <option key={size} value={size}>{size} 条 / 页</option>)}</select></label>
      <div className="flex items-end gap-3"><button className="rounded-lg bg-primary px-5 py-2 text-sm text-primary-foreground">筛选</button><Link className="py-2 text-sm text-muted-foreground" href="/resources/numbers">重置</Link></div>
    </form>
    <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-muted/50"><tr>{["手机号", "开户人", "使用人", "状态", "绑定抖音号", "绑定微信号", "绑定小红书", "绑定快手号", "所在手机"].map(h => <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{data.rows.map(r => <tr key={r.id} className="border-t"><td className={cell}><Link href={`/resources/numbers/${r.id}`} className="font-medium text-primary underline">{r.number}</Link></td><td className={cell}>{r.openedBy || "未登记"}</td><td className={cell}>{r.user?.name ?? "暂未分配"}</td><td className={cell}>{numberStatuses[r.status]}</td><td className={cell}>{r.account ? <Link href={`/accounts/${r.account.id}`} className="text-primary underline">{r.account.name}<span className="mt-1 block text-xs text-muted-foreground">{r.account.douyinId}</span></Link> : "—"}</td>{[r.wechat, r.xiaohongshu, r.kuaishou].map((value, i) => <td key={i} className={cell}>{value || "—"}</td>)}<td className={cell}>{r.phoneSlot ? <Link href={`/resources/phones/${r.phoneSlot.device.id}`} className="text-primary underline">{r.phoneSlot.device.code}<span className="mt-1 block text-xs text-muted-foreground">卡槽 {r.phoneSlot.slot}</span></Link> : r.otherPhone || "未登记或无可见手机"}</td></tr>)}</tbody></table>{!data.rows.length && <p className="p-8 text-center text-sm text-muted-foreground">暂无符合条件的手机号</p>}</div>
    <nav className="flex flex-wrap items-center gap-4 text-sm"><span>共 {data.total} 条 · 第 {data.page} / {data.pages} 页</span>{data.page > 1 && <Link href={pageHref(data.page - 1)}>上一页</Link>}{data.page < data.pages && <Link href={pageHref(data.page + 1)}>下一页</Link>}</nav>
  </>;
}
