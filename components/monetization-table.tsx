import { ReportRecycleForm } from "@/components/report-recycle-form";
import Link from "@/components/context-link";
import type { LiveReport } from "@/app/generated/prisma/client";
import { formatDateTime } from "@/lib/datetime";
import { conversion } from "@/modules/live-reports/monetization-schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function MonetizationTable({ reports }: { reports: (LiveReport & { canDelete?: boolean; canDeleteMoney?: boolean })[] }) {
  return <div className="flex flex-col gap-3"><div className="overflow-x-auto rounded-lg border"><Table className="whitespace-nowrap">
    <TableHeader><TableRow>{["账号", "开播时间", "场次", "场观人数", "进粉丝群", "链接点击", "长按", "后端加入", "有效人数", "进群率", "点击率", "长按率", "长按加入率", "群加入率", "场观加入率", "有效率", "点击加入率", "带货 GMV（元）", "打粉数据更新", "操作"].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{reports.map((r) => <TableRow key={r.id}>
      <TableCell><span className="font-medium">{r.accountName}</span><span className="block text-xs text-muted-foreground">{r.douyinId}</span></TableCell>
      <TableCell>{formatDateTime(r.startedAt)}</TableCell><TableCell>{r.sessionLabel}</TableCell><TableCell>{r.entryCount}</TableCell>
      <TableCell>{r.fanGroupCount ?? "未填写"}</TableCell><TableCell>{r.linkClickCount ?? "未填写"}</TableCell><TableCell>{r.longPressCount ?? "未填写"}</TableCell><TableCell>{r.backendJoinCount ?? "未填写"}</TableCell><TableCell>{r.effectiveCount ?? "未填写"}</TableCell>
      <TableCell>{conversion(r.fanGroupCount,r.entryCount)}</TableCell><TableCell>{conversion(r.linkClickCount,r.entryCount)}</TableCell>
      <TableCell>{conversion(r.longPressCount,r.linkClickCount)}</TableCell><TableCell>{conversion(r.backendJoinCount,r.longPressCount)}</TableCell>
      <TableCell>{conversion(r.backendJoinCount,r.fanGroupCount)}</TableCell><TableCell>{conversion(r.backendJoinCount,r.entryCount)}</TableCell><TableCell>{conversion(r.effectiveCount,r.backendJoinCount)}</TableCell>
      <TableCell>{conversion(r.backendJoinCount,r.linkClickCount)}</TableCell>
      <TableCell>{r.hasSales === null ? "尚未统计" : r.hasSales ? r.salesGmv?.toFixed(2) : "没带货"}</TableCell>
      <TableCell>{r.monetizationUpdatedAt ? <>{r.monetizationUpdatedBy}<span className="block text-xs text-muted-foreground">{formatDateTime(r.monetizationUpdatedAt)}</span></> : "尚未填写"}</TableCell>
      <TableCell><Link className="text-primary underline-offset-4 hover:underline" href={`/live-reports/${r.id}?view=monetization#monetization`}>{r.deletedAt || r.monetizationDeletedAt ? "已删除 / 查看" : "查看 / 填写"}</Link>{r.deletedAt ? r.canDelete && <div className="mt-2"><ReportRecycleForm key={r.version} id={r.id} version={r.version} section="report" restore /></div> : r.canDeleteMoney && r.monetizationUpdatedAt && <div className="mt-2"><ReportRecycleForm key={r.version} id={r.id} version={r.version} section="monetization" restore={!!r.monetizationDeletedAt} /></div>}</TableCell>
    </TableRow>)}{!reports.length && <TableRow><TableCell colSpan={20} className="py-8 text-center text-muted-foreground">暂无符合条件的直播数据</TableCell></TableRow>}</TableBody>
  </Table></div>
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">查看转化率计算口径</summary>
      <p className="mt-2 leading-6">进群率 = 进粉丝群 ÷ 场观人数；点击率 = 链接点击 ÷ 场观人数；长按率 = 长按 ÷ 链接点击；长按加入率 = 后端加入 ÷ 长按；群加入率 = 后端加入 ÷ 进粉丝群；场观加入率 = 后端加入 ÷ 场观人数；有效率 = 有效人数 ÷ 后端加入；点击加入率 = 后端加入 ÷ 链接点击。所有比例乘以 100%，分母为零或数据未填写时显示“—”。</p>
    </details>
  </div>;
}
