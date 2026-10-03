"use client";
import { startTransition, useActionState, useState } from "react";
import { followHref } from "@/lib/navigation-trail";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { leadAction } from "@/modules/leads/actions";
import { powderFields } from "@/modules/live-reports/input-metrics";
import { leadValues, type LeadValues } from "@/modules/leads/schema";
import { ReportMetricSections } from "./report-metric-sections";

export const leadInputClass = "w-full rounded-lg border bg-white px-3 py-2 text-sm";
export function LeadCommandForm({ id, version, command, children, label, source }: { source?: "direct"; id: string; version: number; command: string; children?: React.ReactNode; label: string }) {
  const router = useRouter(), path = usePathname(), search = useSearchParams();
  const [initialVersion] = useState(version);
  const [state, action, pending] = useActionState(async (previous: Awaited<ReturnType<typeof leadAction>>, form: FormData) => { const result = await leadAction(previous, form); if (result.success) { if (command === "claim") router.push(followHref(`/leads/${result.id}`, `${path}?${search}`)); else if (command === "release") router.push("/leads?view=available"); else router.refresh(); } return result; }, {});
  const stale = command !== "claim" && version !== (state.savedVersion ?? initialVersion);
  return <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (command === "release" && !window.confirm("确认撤销本场导粉？已保存草稿将留作历史，重新认领需重新填写导粉数据。")) return; const form = new FormData(e.currentTarget); startTransition(() => action(form)); }}>
    {source && <input type="hidden" name="source" value={source}/>}<input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={state.savedVersion ?? initialVersion} /><input type="hidden" name="command" value={command} />{children}
    {stale && <p role="alert" className="text-sm text-amber-800">记录已有更新。请保留草稿后<button type="button" className="underline" onClick={() => window.location.reload()}>刷新页面</button>核对。</p>}
    {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state.success && <p role="status" className="text-sm text-emerald-800">{state.success}</p>}
    <button disabled={pending || stale} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-50">{pending ? "保存中…" : label}</button>
  </form>;
}
export function LeadDataForm({ id, version, initial, completed, editable, ended, source, liveReadOnly = false }: { source?: "direct"; liveReadOnly?: boolean; id: string; version: number; initial: LeadValues; completed: boolean; editable: boolean; ended: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(() => leadValues(initial));
  const [initialVersion] = useState(version);
  const [state, action, pending] = useActionState(async (previous: Awaited<ReturnType<typeof leadAction>>, form: FormData) => { const result = await leadAction(previous, form); if (result.success) router.refresh(); return result; }, {});
  const stale = version !== (state.savedVersion ?? initialVersion);
  return <form className="space-y-6" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); const button = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; form.set("command", button?.value ?? "save"); startTransition(() => action(form)); }}>
    {source && <input type="hidden" name="source" value={source}/>}<input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={state.savedVersion ?? initialVersion} />
    <p className="text-sm text-slate-500">未确定请留空，实际没有填 0。多个粉丝群按本场汇总；场观人数沿用进房人数。可以跨天补填。</p>
    <label className="block text-sm">本场是否导粉<select aria-label="本场是否导粉" name="leadMode" value={values.leadMode} disabled={!editable || pending} onChange={e=>setValues(v=>({...v,leadMode:e.target.value}))} className={leadInputClass}><option value="">{completed ? "历史未标记" : "请选择"}</option><option value="yes">导粉</option><option value="no">不导粉</option></select></label>
    {values.leadMode === "no" && <><p className="text-sm text-slate-500">本场不导粉，只需填写直播数据；打粉指标不适用。</p>{powderFields.map(([key])=><input key={key} type="hidden" name={key} value={values[key]}/>)}</>}
    {liveReadOnly && <><p className="text-sm text-muted-foreground">直播数据由本场中控填写，下方只读显示。</p><ReportMetricSections values={initial} onChange={()=>{}} disabled completed={completed}/></>}
    <ReportMetricSections live={!liveReadOnly} values={liveReadOnly ? {...values,entryCount:initial.entryCount}:values} onChange={(key,value) => setValues(v => ({ ...v, [key]: value }))} disabled={!editable || pending} completed={completed} powder={values.leadMode !== "no"} />
    {editable && <><label className="block space-y-1 text-sm">{completed ? "更正原因（必填）" : "填写说明（可选）"}<textarea className={leadInputClass} name="reason" maxLength={2000} required={completed} /></label>
      {stale && <p role="alert" className="text-sm text-amber-800">记录已有更新，当前输入已保留。请复制需要的草稿后<button type="button" className="underline" onClick={() => window.location.reload()}>刷新页面</button>核对。</p>}
      <div className="flex gap-3"><button name="command" value="save" disabled={pending || stale} className="rounded-lg border px-5 py-2 text-sm">{completed ? "保存更正" : "保存草稿"}</button>{!completed && <button name="command" value="complete" disabled={pending || stale || !ended} className="rounded-lg bg-emerald-900 px-5 py-2 text-sm text-white disabled:opacity-50">提交完成</button>}</div>{!ended && <p className="text-sm text-slate-500">本场仍在直播，可以先保存草稿，实际下播后再提交完成。</p>}</>}
    {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state.success && <p role="status" className="text-sm text-emerald-800">{state.success}</p>}
  </form>;
}
