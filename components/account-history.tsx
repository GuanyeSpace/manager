import { accountStatusLabel } from "@/lib/account-status";
import Link from "next/link";
import type { AccountRecord } from "@/app/generated/prisma/client";
import { formatDateTime } from "@/lib/datetime";

export function AccountHistory({ records }: { records: AccountRecord[] }) {
  return <div className="flex flex-col gap-3">
    {records.map((r) => <article key={r.id} className="rounded-lg border p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Link className="font-medium underline-offset-4 hover:underline" href={`/accounts/${r.accountId}`}>{r.name} · {r.douyinId}</Link>
        <span>{r.branchName}</span><span className="text-muted-foreground">版本 {r.version} · {accountStatusLabel(r)}</span>
      </div>
      <p className="mt-2">运营：{r.operatorName ?? "无"} · 直播中控：{r.controllerName} · 主播：{r.anchorName ?? "无"}</p>
      <p className="mt-1 text-muted-foreground">{formatDateTime(r.startedAt)} — {r.endedAt ? formatDateTime(r.endedAt) : "当前"} · 操作人：{r.actorName}</p>
    </article>)}
    {!records.length && <p className="text-sm text-muted-foreground">暂无可查看的历史记录</p>}
  </div>;
}
