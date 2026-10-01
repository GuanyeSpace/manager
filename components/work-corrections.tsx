import { endKinds, endKindForOutcome, isOtherEnd } from "@/modules/workbench/schema";
import { WorkWrapFields } from "./work-wrap-fields";
import { WorkActionForm } from "./work-action-form";
import { ScreenshotInput, WorkEvidenceFields } from "./work-evidence-fields";
import { WorkTaskCorrection } from "./work-task-correction";
import { shanghaiInput } from "@/modules/live-reports/schema";
import type { Workflow, Progress } from "@/modules/workbench/schema";
import type { CorrectionChange } from "@/modules/workbench/corrections";
import { formatDateTime } from "@/lib/datetime";

const inputClass = "w-full rounded-lg border px-3 py-2 text-sm";
const buttonClass = "rounded-lg border px-4 py-2 text-sm";
export function CorrectionReason() { return <label className="block space-y-1 text-sm">更正原因（必填）<textarea name="reason" required maxLength={2000} rows={2} className={inputClass} placeholder="说明原记录哪里不准确、为什么需要修改" /></label>; }
export function CorrectionHistory({ rows }: { rows: { id: string; createdAt: Date; detail: unknown }[] }) {
  return <div className="space-y-4">{rows.map(row => {
    const d = row.detail as { actorName?: string; reason?: string; changes?: CorrectionChange[] };
    return <article key={row.id} className="space-y-2 rounded-lg border p-3"><p className="text-sm">{formatDateTime(row.createdAt, true)} · {d.actorName ?? "历史未记录操作人"}</p><p className="whitespace-pre-wrap break-words text-sm">原因：{d.reason}</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">更正内容</th><th className="p-2">更正前</th><th className="p-2">更正后</th></tr></thead><tbody>{d.changes?.map((change, i) => <tr key={i} className="border-t align-top"><td className="p-2">{change.field}</td><td className="whitespace-pre-wrap break-words p-2">{change.before}</td><td className="whitespace-pre-wrap break-words p-2">{change.after}</td></tr>)}</tbody></table></div></article>;
  })}{!rows.length && <p className="text-sm text-muted-foreground">暂无更正记录</p>}</div>;
}

type Session = { id: string; version: number; phase: string; outcome: string | null; startedAt: Date | null; endedAt: Date | null; actualControllerId: string | null; actualControllerName: string | null; controllerId: string; hasViolation: boolean | null; violationDetail: string; hasOtherIncident: boolean | null; hasIncident: boolean | null; wrapNote: string | null };
export function WorkSessionCorrections({ session: s, controllers, workflow, progress, open = false }: { open?: boolean; session: Session; controllers: { id: string; name: string }[]; workflow: Workflow; progress: Progress }) {
  const fields = { id: s.id, version: s.version, command: "correct" };
  return <details open={open} id="session-edit" className="space-y-4 rounded-xl border p-5"><summary className="cursor-pointer font-semibold">更正本场记录</summary><p className="text-sm text-muted-foreground">每次更正需说明原因，原记录和截图保留。场次仍保持归档状态，不会重新开播；事项操作时间由系统记录，不能手工填写。</p>
    {s.phase === "COMPLETE" && <details className="rounded-lg border p-4"><summary className="mb-3 cursor-pointer text-sm font-medium">更正实际开播 / 下播时间</summary><WorkActionForm fields={{ ...fields, kind: "times" }}><label className="text-sm">实际开播<input name="startedAt" type="datetime-local" required defaultValue={s.startedAt ? shanghaiInput(s.startedAt) : ""} className={inputClass} /></label><label className="text-sm">实际下播<input name="endedAt" type="datetime-local" required defaultValue={s.endedAt ? shanghaiInput(s.endedAt) : ""} className={inputClass} /></label><p className="text-xs text-muted-foreground">按北京时间填写，只更正工作记录，统计数据由数据岗位另行维护。</p><CorrectionReason /><button className={buttonClass}>保存时间更正</button></WorkActionForm></details>}
    <details className="rounded-lg border p-4"><summary className="mb-3 cursor-pointer text-sm font-medium">更正本场直播中控</summary><WorkActionForm fields={{ ...fields, kind: "controller" }}><label className="text-sm">实际执行人<select name="actualControllerId" defaultValue={s.actualControllerId ?? s.controllerId} required className={inputClass}>{!controllers.some(p => p.id === (s.actualControllerId ?? s.controllerId)) && <option value={s.actualControllerId ?? s.controllerId}>{s.actualControllerName ?? "原直播中控"}</option>}{controllers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><p className="text-xs text-muted-foreground">更正真实执行人，不会改变登录账号、账号归属或访问权限。</p><CorrectionReason /><button className={buttonClass}>保存直播中控更正</button></WorkActionForm></details>
    <WorkTaskCorrection fields={fields} workflow={workflow} progress={progress} cancelled={s.phase === "CANCELLED"} />
    {s.phase === "COMPLETE" && <details className="rounded-lg border p-4"><summary className="mb-3 cursor-pointer text-sm font-medium">更正异常情况 / 下播方式</summary><WorkActionForm fields={{ ...fields, kind: "wrap" }}><label className="text-sm">下播方式<select name="endKind" defaultValue={endKindForOutcome(s.outcome)} className={inputClass}>{Object.entries(endKinds).filter(([key]) => key !== "interrupted" || s.outcome === "INTERRUPTED").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><WorkWrapFields correcting interrupted={isOtherEnd(s.outcome)} initialIncident={s.hasIncident} hasViolation={s.hasViolation} hasOtherIncident={s.hasOtherIncident} note={s.wrapNote ?? s.violationDetail} evidenceCount={0} /><p className="text-xs">更正为违规或异常中断时请附截图，旧截图保留。</p><CorrectionReason /><button className={buttonClass}>保存异常更正</button></WorkActionForm></details>}

    {s.phase === "CANCELLED" && <details className="rounded-lg border p-4"><summary className="mb-3 cursor-pointer text-sm font-medium">更正未正常开播原因</summary><WorkActionForm fields={{ ...fields, kind: "unstarted" }}><WorkEvidenceFields mode="unstarted" /><CorrectionReason /><button className={buttonClass}>保存未开播更正</button></WorkActionForm></details>}
    <details className="rounded-lg border p-4"><summary className="mb-3 cursor-pointer text-sm font-medium">补充 / 更正截图</summary><WorkActionForm fields={{ ...fields, kind: "evidence" }}><ScreenshotInput /><p className="text-xs text-muted-foreground">若原图传错，请在原因中指明哪张图不准确以及新图的用途。原图仍保留供核对。</p><CorrectionReason /><button className={buttonClass}>保存截图及说明</button></WorkActionForm></details>
  </details>;
}
