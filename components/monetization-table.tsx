import { displaySessionLabel } from "@/lib/session-label";
import { powderRatios } from "@/modules/live-reports/input-metrics";
import { ReportRecycleForm } from "@/components/report-recycle-form";
import Link from "@/components/context-link";
import type { LiveReport } from "@/app/generated/prisma/client";
import { formatDateTime } from "@/lib/datetime";
import { conversion } from "@/modules/live-reports/monetization-schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function MonetizationTable({ reports }: { reports: (LiveReport & {  powderPending?: boolean; leadName?: string; canDelete?: boolean; canDeleteMoney?: boolean })[] }) {
  return <div className="flex flex-col gap-3"><div className="overflow-x-auto rounded-lg border"><Table className="whitespace-nowrap">
    <TableHeader><TableRow>{["账号", "主播", "直播中控", "导粉专员", "开播时间", "场次", "导粉状态", "进房人数", "进粉丝群人数", "链接点击人数", "后端加人数", "后端有效人数", ...powderRatios.map(([label]) => label), "打粉数据更新", "操作"].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{reports.map((r) => <TableRow key={r.id}>
      <TableCell><span className="font-medium">{r.accountName}</span><span className="block text-xs text-muted-foreground">{r.douyinId}</span>{r.directTaskId && <span className="block text-xs text-emerald-800">直接录入</span>}</TableCell>
      <TableCell>{r.anchorName ?? "未记录"}</TableCell><TableCell>{r.controllerName ?? "未记录"}</TableCell><TableCell>{r.leadName ?? "未记录"}</TableCell><TableCell>{formatDateTime(r.startedAt)}</TableCell><TableCell>{displaySessionLabel(r.sessionLabel, r.startedAt)}</TableCell><TableCell>{r.isLeadGeneration === null ? r.powderPending ? "待填打粉数据" : "历史未标记" : r.isLeadGeneration ? "导粉" : "不导粉"}</TableCell><TableCell>{r.entryCount}</TableCell>
      <TableCell>{r.isLeadGeneration === false ? "不适用" : r.fanGroupCount ?? "未填写"}</TableCell><TableCell>{r.isLeadGeneration === false ? "不适用" : r.linkClickCount ?? "未填写"}</TableCell><TableCell>{r.isLeadGeneration === false ? "不适用" : r.backendJoinCount ?? "未填写"}</TableCell><TableCell>{r.isLeadGeneration === false ? "不适用" : r.effectiveCount ?? "未填写"}</TableCell>
      {powderRatios.map(([label,n,d]) => <TableCell key={label}>{r.isLeadGeneration === false ? "不适用" : conversion(r[n],r[d])}</TableCell>)}
      <TableCell>{r.monetizationUpdatedAt ? <>{r.monetizationUpdatedBy}<span className="block text-xs text-muted-foreground">{formatDateTime(r.monetizationUpdatedAt)}</span></> : "尚未填写"}</TableCell>
      <TableCell><Link className="text-primary underline-offset-4 hover:underline" href={`/live-reports/${r.id}?view=monetization#monetization`}>{r.deletedAt || r.monetizationDeletedAt ? "已删除 / 查看" : "查看 / 填写"}</Link>{r.deletedAt ? r.canDelete && <div className="mt-2"><ReportRecycleForm key={r.version} id={r.id} version={r.version} section="report" restore /></div> : r.canDeleteMoney && r.monetizationUpdatedAt && <div className="mt-2"><ReportRecycleForm key={r.version} id={r.id} version={r.version} section="monetization" restore={!!r.monetizationDeletedAt} /></div>}</TableCell>
    </TableRow>)}{!reports.length && <TableRow><TableCell colSpan={20} className="py-8 text-center text-muted-foreground">暂无符合条件的直播数据</TableCell></TableRow>}</TableBody>
  </Table></div>
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">查看转化率计算口径</summary>
      <p className="mt-2 leading-6">场观进群率 = 进粉丝群人数 ÷ 进房人数；链接点击率 = 链接点击人数 ÷ 进粉丝群人数；后端加人率 = 后端加人数 ÷ 进粉丝群人数；后端有效率 = 后端有效人数 ÷ 后端加人数；场观加人率 = 后端加人数 ÷ 进房人数；点击加人率 = 后端加人数 ÷ 链接点击人数。所有比例保留两位小数；分母为零或数据未填写时显示“—”。</p>
    </details>
  </div>;
}
