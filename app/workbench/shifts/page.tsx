import { WorkShiftCorrection } from "@/components/work-shift-panel";
import { CorrectionHistory } from "@/components/work-corrections";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import Link from "@/components/context-link";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/datetime";
import { getShiftHistory } from "@/modules/workbench/queries";
import { equipmentLabels, workStatusLabel, type EquipmentChecks } from "@/modules/workbench/schema";

export default async function ShiftHistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  const params = await searchParams, page = Math.max(1, Math.min(100000, Math.trunc(Number(params.page) || 1)));
  const rows = await getShiftHistory(page);
  return <><h1 className="text-2xl font-semibold">上班与设备检查记录</h1><p className="text-sm text-muted-foreground">按一次上班查看，跨凌晨不拆分；历史场次未补建上班记录。</p>{rows.map(s => {
    const checks = s.checks as EquipmentChecks;
    const times = s.sessions.flatMap(item => item.startedAt ? [item.startedAt.getTime()] : []);
    const advance = times.length ? Math.max(0, Math.floor((Math.min(...times) - s.startedAt.getTime()) / 60000)) : null;
    return <section key={s.id} className="space-y-4 rounded-xl border p-5"><h2 className="font-semibold">{s.userName} · {s.endedAt ? "已结束上班" : "上班中"}</h2><p className="text-sm">到岗 {formatDateTime(s.startedAt, true)} → {s.endedAt ? formatDateTime(s.endedAt, true) : "尚未结束"}</p><p className="text-sm">{advance === null ? "无实际开播记录，不能判断提前到岗" : `首场提前到岗 ${advance} 分钟（要求 30 分钟）`}</p><div className="grid gap-3 sm:grid-cols-2">{Object.entries(equipmentLabels).map(([key, label]) => { const check = checks[key as keyof EquipmentChecks]; return <p key={key} className="text-sm">{label}：{!check ? "未检查" : check.status === "normal" ? "正常" : "异常"}{check && <span className="block text-xs text-muted-foreground">{check.actor} · {formatDateTime(new Date(check.at), true)} · {check.note || "无备注"}</span>}</p>; })}</div><details><summary className="cursor-pointer text-sm">设备检查变更记录</summary><ol className="mt-2 space-y-2">{s.changes.map(c => { const d = c.detail as { command: string; reason?: string; item?: string; after?: { status: string; note: string; actor: string } }; return <li key={c.id} className="text-xs text-muted-foreground">{formatDateTime(c.createdAt, true)} · {d.command === "shiftStart" ? `开始上班${d.reason ? ` · 补填原因：${d.reason}` : ""}` : d.command === "shiftEnd" ? "结束上班" : d.command.startsWith("shiftCorrect") ? "更正上班记录（详见更正历史）" : `${d.item} · ${d.after?.status === "normal" ? "正常" : "异常"} · ${d.after?.note || "无备注"}`}</li>; })}</ol></details>{(s.userId === user.id || isAccountBoss(user)) && <WorkShiftCorrection shift={s} />}<details className="space-y-3"><summary className="cursor-pointer text-sm">上班记录更正历史</summary><CorrectionHistory rows={s.changes.filter(c => (c.detail as { changes?: unknown }).changes)} /></details><div className="space-y-2">{s.sessions.map(item => <Link key={item.id} href={`/workbench/sessions/${item.id}`} className="block text-sm underline">{item.label} · 本场直播中控 {item.actualControllerName ?? "历史未记录"} · {workStatusLabel(item)}</Link>)}</div></section>;
  })}{!rows.length && <p>暂无上班记录</p>}<nav className="flex gap-4 text-sm">{page > 1 && <Link href={`?page=${page - 1}`}>上一页</Link>}<span>第 {page} 页</span>{rows.length === 30 && <Link href={`?page=${page + 1}`}>下一页</Link>}</nav></>;
}
