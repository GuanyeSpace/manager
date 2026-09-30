"use client";

import { startTransition, useActionState, useState, type ReactNode } from "react";
import { shanghaiInput } from "@/modules/live-reports/schema";
import { formatDateTime } from "@/lib/datetime";
import { shiftCommandAction } from "@/modules/workbench/actions";

type Check = { status: "normal" | "issue"; note: string; at: string; actor: string };
type CheckItem = "computer" | "sound" | "picture" | "network";
type Shift = { id: string; version: number; startedAt: Date; endedAt: Date | null; checks: unknown; userName: string };

const items: { key: CheckItem; label: string }[] = [
  { key: "computer", label: "电脑" },
  { key: "sound", label: "麦克风与声音" },
  { key: "picture", label: "摄像机与画面" },
  { key: "network", label: "网络" },
];
const buttonClass = "rounded-lg border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50";
const inputClass = "w-full rounded-lg border px-3 py-2 text-sm";

function ShiftForm({ fields, children, className = "space-y-3" }: { fields: Record<string, string | number>; children: ReactNode; className?: string }) {
  const [state, action, pending] = useActionState(shiftCommandAction, undefined);
  const [initialVersion] = useState(fields.version);
  const correcting = String(fields.command).startsWith("shiftCorrect");
  return <form className={className} onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }}>
    {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={name === "version" && correcting ? state?.savedVersion ?? initialVersion : value} />)}
    <fieldset disabled={pending} className="contents">{children}</fieldset>
    {correcting && fields.version !== (state?.savedVersion ?? initialVersion) && <p className="text-sm text-amber-800">上班记录已更新。请保留需要的草稿后<button type="button" className="underline" onClick={() => window.location.reload()}>刷新页面</button>，再核对更正。</p>}
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state?.success && <p role="status" className="text-xs text-emerald-700">{state.success}</p>}
    {pending && <p className="text-xs text-muted-foreground">保存中…</p>}
  </form>;
}

function CheckForm({ shift, item, label, saved }: { shift: Shift; item: CheckItem; label: string; saved?: Check }) {
  const [status, setStatus] = useState(saved?.status ?? "");
  return <div className="space-y-3 border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <span className={`text-xs ${saved?.status === "issue" ? "text-amber-800" : "text-muted-foreground"}`}>
        {saved?.status === "normal" ? "已记录正常" : saved?.status === "issue" ? "已记录异常" : "待检查"}
      </span>
    </div>
    {saved && <div className="space-y-1 text-xs leading-5 text-muted-foreground">
      <p>{saved.actor} · {formatDateTime(new Date(saved.at), true)}</p>
      {saved.note && <p className="whitespace-pre-wrap break-words">备注：{saved.note}</p>}
    </div>}
    <ShiftForm fields={{ command: "shiftCheck", id: shift.id, version: shift.version, item }}>
      <label className="block space-y-1 text-sm"><span>检查结果</span>
        <select name="status" required value={status} onChange={event => setStatus(event.target.value)} className={inputClass}>
          <option value="" disabled>请选择</option><option value="normal">正常</option><option value="issue">异常</option>
        </select>
      </label>
      <label className="block space-y-1 text-sm"><span>备注{status === "issue" ? "（异常时必填）" : "（选填）"}</span>
        <textarea name="note" required={status === "issue"} defaultValue={saved?.note ?? ""} maxLength={2000} rows={2} className={inputClass} />
      </label>
      <button type="submit" className={buttonClass}>保存{label}检查</button>
    </ShiftForm>
  </div>;
}

export function WorkShiftPanel({ shift, firstStartedAt, unfinished }: { shift: Shift | null; firstStartedAt: Date | null; unfinished: number }) {
  if (!shift) return <section className="space-y-4 rounded-xl border p-5">
    <div><h2 className="font-semibold">本次上班</h2><p className="mt-1 text-sm text-muted-foreground">开始上班后，完成每日设备检查，再准备开播。</p></div>
    <ShiftForm fields={{ command: "shiftStart" }}><button type="submit" className={buttonClass}>开始上班</button></ShiftForm>
    <details className="rounded-lg border p-3"><summary className="mb-3 cursor-pointer text-sm">已到岗但忘记登记？补填到岗时间</summary><ShiftForm fields={{ command: "shiftStart" }}><label className="text-sm">实际到岗时间<input type="datetime-local" name="startedAt" required className={inputClass} /></label><label className="text-sm">补填原因<textarea name="reason" required maxLength={2000} className={inputClass} /></label><button className={buttonClass}>补填并开始本次上班</button></ShiftForm></details>
  </section>;

  const checks = (shift.checks ?? {}) as Partial<Record<CheckItem, Check>>;
  const minutes = firstStartedAt ? Math.max(0, Math.floor((new Date(firstStartedAt).getTime() - new Date(shift.startedAt).getTime()) / 60000)) : null;
  const arrival = minutes === null ? "未开播，不能判断提前到岗" : minutes > 0 ? `首场开播前 ${minutes} 分钟到岗` : minutes === 0 ? "与首场开播同时到岗" : `首场开播后 ${Math.abs(minutes)} 分钟到岗`;

  return <section className="space-y-5 rounded-xl border p-5">
    <div className="space-y-1"><h2 className="font-semibold">本次上班</h2><p className="text-sm text-muted-foreground">{shift.userName} · 到岗时间 {formatDateTime(new Date(shift.startedAt), true)}</p><p className="text-sm">{arrival}{minutes !== null && "（要求提前 30 分钟）"}</p></div>
    <div className="space-y-1"><h3 className="text-sm font-semibold">每日设备检查</h3><p className="text-xs leading-5 text-muted-foreground">每天开播前，声音、画面和网络须记录为正常；电脑检查也请记录。跨零点仍属同次上班，不要求重复检查。</p></div>
    <div className="grid gap-4 md:grid-cols-2">{items.map(({ key, label }) => <CheckForm key={key} shift={shift} item={key} label={label} saved={checks[key]} />)}</div>
    <WorkShiftCorrection shift={shift} />
    <div className="space-y-2 border-t pt-4"><p className="text-xs leading-5 text-muted-foreground">所有场次完成收尾后，结束本次上班。</p>
      {unfinished > 0 && <p className="text-sm text-amber-800" role="status">还有 {unfinished} 场准备中、直播中或待收尾，完成后才能结束上班。</p>}
      <ShiftForm fields={{ command: "shiftEnd", id: shift.id, version: shift.version }}><button type="submit" disabled={unfinished > 0} className={buttonClass}>结束上班</button></ShiftForm>
    </div>
  </section>;
}


export function WorkShiftCorrection({ shift }: { shift: Shift }) {
  const [item, setItem] = useState<CheckItem>("computer");
  const saved = (shift.checks as Partial<Record<CheckItem, Check>>)[item];
  const fields = { id: shift.id, version: shift.version };
  const reason = <label className="text-sm">更正原因（必填）<textarea name="reason" required maxLength={2000} className={inputClass} /></label>;
  return <details className="space-y-4 rounded-lg border p-4"><summary className="cursor-pointer text-sm font-semibold">更正本次上班记录</summary><p className="text-xs text-muted-foreground">按北京时间填写，修改前后的内容及操作时间保留；跨凌晨仍是同次上班。</p>
    <ShiftForm fields={{ ...fields, command: "shiftCorrectTime" }}><label className="text-sm">实际到岗<input type="datetime-local" name="startedAt" required defaultValue={shanghaiInput(new Date(shift.startedAt))} className={inputClass} /></label>{shift.endedAt && <label className="text-sm">实际结束上班<input type="datetime-local" name="endedAt" required defaultValue={shanghaiInput(new Date(shift.endedAt))} className={inputClass} /></label>}{reason}<button className={buttonClass}>保存上班时间更正</button></ShiftForm>
    <details className="space-y-3 border-t pt-3"><summary className="cursor-pointer text-sm">更正每日设备检查</summary><label className="text-sm">选择检查项<select value={item} onChange={e => setItem(e.target.value as CheckItem)} className={inputClass}>{items.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}</select></label><ShiftForm key={item} fields={{ ...fields, command: "shiftCorrectCheck", item }}><label className="text-sm">实际检查结果<select name="status" defaultValue={saved?.status ?? "normal"} className={inputClass}><option value="normal">正常</option><option value="issue">异常</option></select></label><label className="text-sm">备注（异常时必填）<textarea name="note" defaultValue={saved?.note ?? ""} maxLength={2000} className={inputClass} /></label><p className="text-xs text-muted-foreground">保留原检查时间；更正时间由系统另外记录。</p>{reason}<button className={buttonClass}>保存检查更正</button></ShiftForm></details>
  </details>;
}
