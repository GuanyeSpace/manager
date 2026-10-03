import { audienceText } from "@/modules/live-reports/input-metrics";
import { ReportRecycleForm } from "@/components/report-recycle-form";
import Link from "@/components/context-link";
import type { LiveReport } from "@/app/generated/prisma/client";
import { formatDateTime } from "@/lib/datetime";
import { durationText, percentage } from "@/modules/live-reports/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function LiveReportTable({ reports }: { reports: (LiveReport & {  powderPending?: boolean; leadName?: string; canDelete?: boolean })[] }) {
  return <div className="overflow-x-auto rounded-lg border"><Table className="whitespace-nowrap">
    <TableHeader><TableRow>{["账号", "主播", "直播中控", "导粉专员", "开播时间", "直播时长", "场次", "导粉状态", "曝光人数", "进房人数", "进房率", "平均在线", "最高在线", "人均停留（分钟）", "评论人数", "点赞次数", "新增粉丝", "粉丝转化率", "分享次数", "加粉丝团人数", "女性比例", "31–40岁比例", "当场分公司", "操作"].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{reports.map((r) => <TableRow key={r.id}>
      <TableCell><span className="font-medium">{r.accountName}</span><span className="block text-xs text-muted-foreground">{r.douyinId}</span>{r.directTaskId && <span className="block text-xs text-emerald-800">直接录入</span>}</TableCell>
      <TableCell>{r.anchorName ?? "未记录"}</TableCell><TableCell>{r.controllerName ?? "未记录"}</TableCell><TableCell>{r.leadName ?? "未记录"}</TableCell><TableCell>{formatDateTime(r.startedAt)}</TableCell><TableCell>{durationText(r.durationSeconds)}</TableCell><TableCell>{r.sessionLabel}</TableCell><TableCell>{r.isLeadGeneration === null ? r.powderPending ? "待填打粉数据" : "历史未标记" : r.isLeadGeneration ? "导粉" : "不导粉"}</TableCell>
      <TableCell>{r.exposureCount}</TableCell><TableCell>{r.entryCount}</TableCell><TableCell>{percentage(r.entryCount,r.exposureCount)}</TableCell>
      <TableCell>{r.averageOnline}</TableCell><TableCell>{r.peakOnline}</TableCell><TableCell>{r.averageStayHundredths / 100}</TableCell>
      <TableCell>{r.commenterCount}</TableCell><TableCell>{r.likeCount}</TableCell><TableCell>{r.newFollowers}</TableCell><TableCell>{percentage(r.newFollowers,r.entryCount)}</TableCell>
      <TableCell>{r.shareCount}</TableCell><TableCell>{r.newFanClubMembers}</TableCell><TableCell>{audienceText(r.femaleHundredths)}</TableCell><TableCell>{audienceText(r.age31To40Hundredths)}</TableCell><TableCell>{r.branchName}</TableCell>
      <TableCell><Link className="text-primary underline-offset-4 hover:underline" href={`/live-reports/${r.id}`}>详情</Link>{r.canDelete && <div className="mt-2"><ReportRecycleForm key={r.version} id={r.id} version={r.version} section="report" restore={!!r.deletedAt} /></div>}</TableCell>
    </TableRow>)}{!reports.length && <TableRow><TableCell colSpan={24} className="py-8 text-center text-muted-foreground">暂无符合条件的直播数据</TableCell></TableRow>}</TableBody>
  </Table></div>;
}
