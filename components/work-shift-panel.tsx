"use client";

import { startTransition, useActionState, useState, useEffect, useRef, type ReactNode } from "react";
import { shanghaiInput } from "@/modules/live-reports/schema";
import { formatDateTime } from "@/lib/datetime";
import { shiftCommandAction, saveShiftCheckAction } from "@/modules/workbench/actions";

import { completedCheckCount, SHIFT_MINIMUM_MS, equipmentLabels, equipmentTargets, type EquipmentChecks } from "@/modules/workbench/schema";

type Check = { status: "normal" | "issue"; note: string; at: string; actor: string };
type CheckItem = "computer" | "sound" | "picture" | "network";
type Shift = { clockStartedAt: Date | null; checkedInAt: Date | null; createdAt: Date; id: string; version: number; startedAt: Date; endedAt: Date | null; checks: unknown; userName: string };

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

function CheckRow({ item, saved, busy, save }: { item: CheckItem; saved?: Check; busy: boolean; save: (item: CheckItem, status: Check["status"], note: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(!saved);
  const [status, setStatus] = useState<Check["status"] | "">(saved?.status ?? "");
  const [note, setNote] = useState(saved?.note ?? "");
  const [error, setError] = useState("");
  const label = equipmentLabels[item];
  async function complete() {
    if (!status) { setError("请选择正常或异常"); return; }
    if (status === "issue" && !note.trim()) { setError("请填写异常情况"); return; }
    setError("");
    if (await save(item, status, status === "issue" ? note : "")) setEditing(false);
  }
  return <section aria-label={`${label}检查`} className="space-y-3 border-t py-4">
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_130px_130px]">
      <div><h3 className="font-medium">{label}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">检查目标：{equipmentTargets[item]}</p></div>
      {editing ? <select aria-label={`${label}检查结果`} value={status} onChange={e => setStatus(e.target.value as Check["status"])} className={inputClass}><option value="" disabled>请选择</option><option value="normal">正常</option><option value="issue">异常</option></select> : <p className={`text-sm ${saved?.status === "issue" ? "text-amber-800" : "text-emerald-800"}`}>{saved?.status === "issue" ? "异常" : "正常"}</p>}
      <div className="space-y-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`${label}完成`} checked={!editing && !!saved} disabled={!editing || busy} onChange={() => { void complete(); }} />{editing ? "完成" : "已完成"}</label>{!editing && <button type="button" disabled={busy} onClick={() => { setStatus(saved?.status ?? ""); setNote(saved?.note ?? ""); setError(""); setEditing(true); }} className="text-xs underline">修改结果</button>}{editing && saved && <button type="button" disabled={busy} className="text-xs underline" onClick={() => { setEditing(false); setError(""); }}>取消修改</button>}</div>
    </div>
    {editing && status === "issue" && <label className="block space-y-1 text-sm"><span>{label}异常情况（必填）</span><textarea aria-label={`${label}异常情况`} value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={2} className={inputClass} /></label>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved && <div className="text-xs text-muted-foreground"><p>{editing ? "当前已保存：" : "完成时间："}{formatDateTime(new Date(saved.at), true)} · {saved.actor}</p>{saved.note && <p className="mt-1 whitespace-pre-wrap break-words">{saved.note}</p>}</div>}
  </section>;
}

function ActiveShift({ shift, firstStartedAt, unfinished, serverNow }: { shift: Shift; firstStartedAt: Date | null; unfinished: number; serverNow: Date }) {
  const [snapshot, setSnapshot] = useState({ version: shift.version, checks: shift.checks as EquipmentChecks, checkedInAt: shift.checkedInAt?.toISOString() ?? null });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(new Date(serverNow).getTime());
  if (shift.version > snapshot.version) setSnapshot({ version: shift.version, checks: shift.checks as EquipmentChecks, checkedInAt: shift.checkedInAt?.toISOString() ?? null });
  useEffect(() => {
    const base = new Date(serverNow).getTime(), mounted = performance.now();
    const timer = setInterval(() => setNow(base + performance.now() - mounted), 1000);
    return () => clearInterval(timer);
  }, [serverNow]);
  async function save(item: CheckItem, status: Check["status"], note: string) {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const form = new FormData();
      for (const [key, value] of Object.entries({ id: shift.id, version: snapshot.version, item, status, note })) form.set(key, String(value));
      const result = await saveShiftCheckAction(form);
      if (!result.saved) { setError(result.error ?? "保存失败，请重试"); return false; }
      setSnapshot(result.saved); return true;
    } catch { setError("保存失败，请检查网络后重试；输入已保留"); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }
  const complete = completedCheckCount(snapshot.checks);
  const elapsed = Math.max(0, now - new Date(shift.clockStartedAt ?? shift.createdAt).getTime());
  const remaining = Math.max(0, SHIFT_MINIMUM_MS - elapsed);
  const minutes = firstStartedAt ? Math.floor((new Date(firstStartedAt).getTime() - new Date(shift.startedAt).getTime()) / 60000) : null;
  const blockEnd = complete < 4 || unfinished > 0 || busy;
  return <section className="space-y-5 rounded-xl border bg-white p-5">
    <div className="space-y-2"><h2 className="font-semibold">{complete === 4 ? "到岗成功" : `检查中（${complete}/4）`}</h2><p className="text-sm text-muted-foreground">{shift.userName} · 登记上班时间 {formatDateTime(new Date(shift.startedAt), true)}</p><p className="text-sm">首次完成全部检查：{snapshot.checkedInAt ? formatDateTime(new Date(snapshot.checkedInAt), true) : complete === 4 ? "历史未记录" : "尚未完成"}</p><p className="text-xs text-muted-foreground">系统计时从 {formatDateTime(new Date(shift.clockStartedAt ?? shift.createdAt), true)} 开始；补登或更正登记时间不改变计时。</p>{minutes !== null && <p className="text-sm">{minutes >= 0 ? `首场提前 ${minutes} 分钟登记上班` : `首场开播后 ${-minutes} 分钟登记上班`}（要求提前30分钟）</p>}</div>
    <div><h3 className="font-semibold">每日设备检查</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">选择结果后勾选完成即保存。异常请填写情况；四项全部完成即到岗成功。声音、画面、网络须恢复正常后才能开播。</p></div>
    <div>{items.map(({ key }) => <CheckRow key={key} item={key} saved={snapshot.checks[key]} busy={busy} save={save} />)}</div>
    {busy && <p role="status" className="text-sm text-muted-foreground">正在保存检查结果…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <WorkShiftCorrection shift={{ ...shift, version: snapshot.version, checks: snapshot.checks }} />
    <div className="space-y-3 border-t pt-4"><p className="text-sm">完成四项检查及全部场次收尾后，才可结束上班。</p>{unfinished > 0 && <p className="text-sm text-amber-800">还有 {unfinished} 场准备中、直播中或待收尾。</p>}
      <ShiftForm fields={{ command: "shiftEnd", id: shift.id, version: snapshot.version }}><button disabled={blockEnd || remaining > 0} className={buttonClass}>结束上班</button></ShiftForm>
      {remaining > 0 && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">提前下班</summary><p className="my-3 text-xs text-muted-foreground">未满8小时需填写原因，系统保留提前下班记录；仍须完成四项检查和场次收尾。</p><ShiftForm fields={{ command: "shiftEarlyEnd", id: shift.id, version: snapshot.version }}><label className="block space-y-1 text-sm"><span>提前下班原因（必填）</span><textarea name="reason" required maxLength={2000} rows={2} className={inputClass} /></label><button disabled={blockEnd} className={buttonClass}>确认提前下班</button></ShiftForm></details>}
    </div>
  </section>;
}

export function WorkShiftPanel({ shift, firstStartedAt, unfinished, serverNow }: { shift: Shift | null; firstStartedAt: Date | null; unfinished: number; serverNow: Date }) {
  if (!shift) return <section className="space-y-4 rounded-xl border p-5">
    <div><h2 className="font-semibold">本次上班</h2><p className="mt-1 text-sm text-muted-foreground">点击后开始计时；完成四项设备检查才算到岗成功。</p></div>
    <ShiftForm fields={{ command: "shiftStart" }}><button type="submit" className={buttonClass}>开始上班</button></ShiftForm>
    <details className="rounded-lg border p-3"><summary className="mb-3 cursor-pointer text-sm">已到岗但忘记登记？补填到岗时间</summary><ShiftForm fields={{ command: "shiftStart" }}><label className="text-sm">实际到岗时间<input type="datetime-local" name="startedAt" required className={inputClass} /></label><label className="text-sm">补填原因<textarea name="reason" required maxLength={2000} className={inputClass} /></label><button className={buttonClass}>补填并开始本次上班</button></ShiftForm></details>
  </section>;

  return <ActiveShift key={shift.id} shift={shift} firstStartedAt={firstStartedAt} unfinished={unfinished} serverNow={serverNow} />;
}


export function WorkShiftCorrection({ shift }: { shift: Shift }) {
  const [item, setItem] = useState<CheckItem>("computer");
  const saved = (shift.checks as Partial<Record<CheckItem, Check>>)[item];
  const fields = { id: shift.id, version: shift.version };
  const reason = <label className="text-sm">更正原因（必填）<textarea name="reason" required maxLength={2000} className={inputClass} /></label>;
  return <details className="space-y-4 rounded-lg border p-4"><summary className="cursor-pointer text-sm font-semibold">更正本次上班记录</summary><p className="text-xs text-muted-foreground">按北京时间填写，修改前后的内容及操作时间保留；更正不改变系统计时起点或提前下班标记。</p>
    <ShiftForm fields={{ ...fields, command: "shiftCorrectTime" }}><label className="text-sm">实际到岗<input type="datetime-local" name="startedAt" required defaultValue={shanghaiInput(new Date(shift.startedAt))} className={inputClass} /></label>{shift.endedAt && <label className="text-sm">实际结束上班<input type="datetime-local" name="endedAt" required defaultValue={shanghaiInput(new Date(shift.endedAt))} className={inputClass} /></label>}{reason}<button className={buttonClass}>保存上班时间更正</button></ShiftForm>
    <details className="space-y-3 border-t pt-3"><summary className="cursor-pointer text-sm">更正每日设备检查</summary><label className="text-sm">选择检查项<select value={item} onChange={e => setItem(e.target.value as CheckItem)} className={inputClass}>{items.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}</select></label><ShiftForm key={item} fields={{ ...fields, command: "shiftCorrectCheck", item }}><label className="text-sm">实际检查结果<select name="status" defaultValue={saved?.status ?? "normal"} className={inputClass}><option value="normal">正常</option><option value="issue">异常</option></select></label><label className="text-sm">备注（异常时必填）<textarea name="note" defaultValue={saved?.note ?? ""} maxLength={2000} className={inputClass} /></label><p className="text-xs text-muted-foreground">保留原检查时间；更正时间由系统另外记录。</p>{reason}<button className={buttonClass}>保存检查更正</button></ShiftForm></details>
  </details>;
}
