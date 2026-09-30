"use client";
import { startTransition, useActionState, useState } from "react";
import { followHref } from "@/lib/navigation-trail";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { leadAction } from "@/modules/leads/actions";
import { leadFields, leadValues, type LeadValues } from "@/modules/leads/schema";
import { percentage } from "@/modules/live-reports/schema";

export const leadInputClass = "w-full rounded-lg border bg-white px-3 py-2 text-sm";
export function LeadCommandForm({ id, version, command, children, label }: { id: string; version: number; command: string; children?: React.ReactNode; label: string }) {
  const router = useRouter(), path = usePathname(), search = useSearchParams();
  const [initialVersion] = useState(version);
  const [state, action, pending] = useActionState(async (previous: Awaited<ReturnType<typeof leadAction>>, form: FormData) => { const result = await leadAction(previous, form); if (result.success) { if (command === "claim") router.push(followHref(`/leads/${result.id}`, `${path}?${search}`)); else router.refresh(); } return result; }, {});
  const stale = command !== "claim" && version !== (state.savedVersion ?? initialVersion);
  return <form className="space-y-3" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); startTransition(() => action(form)); }}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={state.savedVersion ?? initialVersion} /><input type="hidden" name="command" value={command} />{children}
    {stale && <p role="alert" className="text-sm text-amber-800">记录已有更新。请保留草稿后<button type="button" className="underline" onClick={() => window.location.reload()}>刷新页面</button>核对。</p>}
    {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state.success && <p role="status" className="text-sm text-emerald-800">{state.success}</p>}
    <button disabled={pending || stale} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-50">{pending ? "保存中…" : label}</button>
  </form>;
}
export function LeadDataForm({ id, version, initial, completed, editable, ended }: { id: string; version: number; initial: LeadValues; completed: boolean; editable: boolean; ended: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(() => leadValues(initial));
  const [initialVersion] = useState(version);
  const [state, action, pending] = useActionState(async (previous: Awaited<ReturnType<typeof leadAction>>, form: FormData) => { const result = await leadAction(previous, form); if (result.success) router.refresh(); return result; }, {});
  const stale = version !== (state.savedVersion ?? initialVersion);
  const ratios = [["进房率", "entryCount", "exposureCount"], ["新增率", "newFollowers", "entryCount"], ["进群率", "fanGroupCount", "entryCount"], ["点击率", "linkClickCount", "entryCount"], ["长按率", "longPressCount", "linkClickCount"], ["长按加入率", "backendJoinCount", "longPressCount"], ["群加入率", "backendJoinCount", "fanGroupCount"], ["场观加入率", "backendJoinCount", "entryCount"], ["有效率", "effectiveCount", "backendJoinCount"], ["点击加入率", "backendJoinCount", "linkClickCount"]] as const;
  return <form className="space-y-6" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); const button = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; form.set("command", button?.value ?? "save"); startTransition(() => action(form)); }}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={state.savedVersion ?? initialVersion} />
    <p className="text-sm text-slate-500">未确定请留空，实际没有填 0。多个粉丝群按本场汇总；场观人数沿用进房人数。可以跨天补填。</p>
    {[["直播数据", leadFields.slice(0, 13)], ["打粉数据", leadFields.slice(13)]] .map(([title, fields]) => <section key={String(title)} className="space-y-4 rounded-xl border bg-white p-5"><h2 className="font-semibold">{String(title)}</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{(fields as typeof leadFields[number][]).map(([key, label]) => <label key={key} className="space-y-1 text-sm">{label}<input name={key} aria-label={label} type="number" min="0" step={key === "averageStayMinutes" ? "0.01" : "1"} disabled={!editable || pending} className={leadInputClass} value={values[key]} placeholder="待补填" onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} /></label>)}</div></section>)}
    <section className="grid gap-3 rounded-xl bg-slate-100 p-5 text-sm sm:grid-cols-2 xl:grid-cols-5">{ratios.map(([label, numerator, denominator]) => <p key={label}>{label}：{values[numerator] === "" || values[denominator] === "" ? "—" : percentage(Number(values[numerator]), Number(values[denominator]))}</p>)}</section>
    {editable && <><label className="block space-y-1 text-sm">{completed ? "更正原因（必填）" : "填写说明（可选）"}<textarea className={leadInputClass} name="reason" maxLength={2000} required={completed} /></label>
      {stale && <p role="alert" className="text-sm text-amber-800">记录已有更新，当前输入已保留。请复制需要的草稿后<button type="button" className="underline" onClick={() => window.location.reload()}>刷新页面</button>核对。</p>}
      <div className="flex gap-3"><button name="command" value="save" disabled={pending || stale} className="rounded-lg border px-5 py-2 text-sm">{completed ? "保存更正" : "保存草稿"}</button>{!completed && <button name="command" value="complete" disabled={pending || stale || !ended} className="rounded-lg bg-emerald-900 px-5 py-2 text-sm text-white disabled:opacity-50">提交完成</button>}</div>{!ended && <p className="text-sm text-slate-500">本场仍在直播，可以先保存草稿，实际下播后再提交完成。</p>}</>}
    {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state.success && <p role="status" className="text-sm text-emerald-800">{state.success}</p>}
  </form>;
}
