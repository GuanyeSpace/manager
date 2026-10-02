import Link from "@/components/context-link";
import { listPhones } from "@/modules/resources/queries";
const control = "min-w-0 rounded-lg border bg-background px-3 py-2 text-sm";
const cell = "px-4 py-4 align-top";
export async function PhoneDirectory({ q, page, pageSize, userId, status }: { q: string; page: number; pageSize: number; userId: string; status: string }) {
  const data = await listPhones(q, page, pageSize, userId, status);
  const pageHref = (page: number) => `?${new URLSearchParams({ q, userId, status: data.status, pageSize: String(data.pageSize), page: String(page) })}`;
  return <>
    <header className="flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold">手机管理</h1>{data.manager && <Link href="/resources/phones/new" className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">新增手机</Link>}</header>
    <p className="text-sm text-muted-foreground">登录账号按实际情况单独登记；卡槽显示装在这台手机中的号码。购入价格、估值和其他归属信息可在详情查看。</p>
    <form method="GET" key={`${q}-${userId}-${data.status}-${data.pageSize}`} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 xl:grid-cols-5">
      <label className="grid gap-2 text-sm">搜索<input name="q" maxLength={100} defaultValue={q} placeholder="编号、型号、账号或手机号" className={control} /></label>
      <label className="grid gap-2 text-sm">使用人<select name="userId" defaultValue={userId} className={control}><option value="">全部使用人</option><option value="unassigned">暂未分配</option>{data.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm">状态<select name="status" defaultValue={data.status} className={control}><option value="">全部状态</option><option value="active">启用</option><option value="inactive">停用</option></select></label>
      <label className="grid gap-2 text-sm">每页显示<select name="pageSize" defaultValue={data.pageSize} className={control}>{[10,20,50].map(size => <option key={size} value={size}>{size} 条 / 页</option>)}</select></label>
      <div className="flex items-end gap-3"><button className="rounded-lg bg-primary px-5 py-2 text-sm text-primary-foreground">筛选</button><Link href="/resources/phones" className="py-2 text-sm text-muted-foreground">重置</Link></div>
    </form>
    <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-muted/50"><tr>{["手机编号", "信息", "使用人", "登录抖音号", "登录微信号", "安置的手机卡", "状态"].map(label => <th key={label} className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{data.rows.map(phone => <tr key={phone.id} className="border-t"><td className={cell}><Link href={`/resources/phones/${phone.id}`} className="font-medium text-primary underline">{phone.code}</Link><p className="mt-1 text-xs text-muted-foreground">{phone.branch.name}</p></td><td className={`${cell} min-w-40`}><p>{phone.model}</p>{phone.purpose && <p className="mt-1 text-xs text-muted-foreground">{phone.purpose}</p>}</td><td className={cell}>{phone.user?.name ?? "暂未分配"}</td><td className={cell}>{phone.phoneLogins.length ? phone.phoneLogins.map(({ account }) => <Link key={account.id} href={`/accounts/${account.id}`} className="mb-2 block text-primary underline">{account.name}<span className="block text-xs text-muted-foreground">{account.douyinId}</span></Link>) : "未登记"}</td><td className={`${cell} whitespace-pre-line`}>{phone.loginWechats || "未登记"}</td><td className={`${cell} whitespace-nowrap`}>{[1,2].map(slot => { const card = phone.slots.find(s => s.slot === slot); return <p key={slot} className="mb-2">卡槽 {slot}：{card ? <Link href={`/resources/numbers/${card.phoneNumber.id}`} className="text-primary underline">{card.phoneNumber.number}</Link> : "—"}</p>; })}</td><td className={cell}>{phone.active ? "启用" : "停用"}</td></tr>)}</tbody></table>{!data.rows.length && <p className="p-8 text-center text-sm text-muted-foreground">暂无符合条件的手机</p>}</div>
    <nav className="flex flex-wrap gap-4 text-sm"><span>共 {data.total} 条 · 第 {data.page} / {data.pages} 页</span>{data.page > 1 && <Link href={pageHref(data.page - 1)}>上一页</Link>}{data.page < data.pages && <Link href={pageHref(data.page + 1)}>下一页</Link>}</nav>
  </>;
}
