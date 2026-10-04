import { isShiftExpired } from "@/modules/workbench/schema";
import Link from "./context-link";
import { getManagedShifts } from "@/modules/workbench/queries";
import type { ManagementParams } from "@/modules/workbench/management";
import { formatDateTime } from "@/lib/datetime";
import { ManagementFilters, ManagementPager } from "./work-management-filters";
export async function ManagedShiftList({ params }: { params: ManagementParams }) {
  const data = await getManagedShifts(params);
  return <><h1 className="text-2xl font-semibold">上班检查记录</h1><ManagementFilters params={params} people={data.people} statuses={{ active: "上班中", ended: "已下班", early: "提前下班" }} /><div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-muted/50"><tr>{["员工","上班时间","下班时间","检查结果","上班状态","操作"].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>{data.rows.map(s => <tr key={s.id} className="border-t"><td className="p-3">{s.userName}</td><td className="p-3">{formatDateTime(s.startedAt,true)}</td><td className="p-3">{s.endedAt ? formatDateTime(s.endedAt,true) : "—"}</td><td className="p-3">{s.summary}</td><td className="p-3">{s.endedAt ? s.missedEndRecordedAt ? "补登下班" : s.earlyEndReason ? "提前下班" : "已下班" : isShiftExpired(s) ? "超时待处理" : s.summary === "未完成" ? "检查中" : "到岗成功"}</td><td className="p-3"><Link className="underline" href={`/workbench/shifts/${s.id}`}>查看</Link></td></tr>)}</tbody></table>{!data.rows.length && <p className="p-6 text-sm">暂无记录</p>}</div><ManagementPager params={params} {...data} /></>;
}
