import { accountStatusLabel } from "@/lib/account-status";
import Link from "@/components/context-link";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { listAccounts } from "@/modules/accounts/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const { accounts, canCreate } = await listAccounts(q);
  return <>
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold">抖音账号</h1>
      {canCreate && <Button asChild><Link href="/accounts/new">新增账号</Link></Button>}
    </div>
    <p className="text-sm text-muted-foreground">展示你当前有权查看的账号。交接前的记录可在「历史记录」中查看。</p>
    <form method="GET" action="/accounts" className="flex gap-3">
      <Input aria-label="搜索账号名称或抖音号" name="q" defaultValue={q} placeholder="搜索账号名称或抖音号" maxLength={100} className="max-w-sm" />
      <Button variant="secondary">搜索</Button>
      {q && <Link href="/accounts" className="self-center text-sm">清除</Link>}
    </form>
    <div className="overflow-x-auto rounded-lg border"><Table>
      <TableHeader><TableRow>{["账号名称", "抖音号", "实名人", "绑定手机号", "直播间", "分公司", "运营", "直播中控", "主播", "状态", "操作"].map((v) => <TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{accounts.map((a) => <TableRow key={a.id}>
        <TableCell className="font-medium">{a.name}</TableCell><TableCell>{a.douyinId}</TableCell><TableCell>{a.realName || "未填写"}</TableCell><TableCell>{a.phoneNumber ? <Link className="text-primary underline" href={`/resources/numbers/${a.phoneNumber.id}`}>{a.phoneNumber.number}</Link> : a.phone || "未绑定"}</TableCell><TableCell>{a.room ? <Link className="text-primary underline" href={`/resources/rooms/${a.room.id}`}>{a.room.name}</Link> : "未分配"}</TableCell><TableCell>{a.branch.name}</TableCell>
        <TableCell>{a.operator?.name ?? "无"}</TableCell><TableCell>{a.controller.name}</TableCell><TableCell>{a.anchor?.name ?? "无"}</TableCell>
        <TableCell>{accountStatusLabel(a)}</TableCell><TableCell><Link className="text-primary" href={`/accounts/${a.id}`}>查看</Link></TableCell>
      </TableRow>)}{!accounts.length && <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">暂无符合条件的账号</TableCell></TableRow>}</TableBody>
    </Table></div>
  </>;
}
