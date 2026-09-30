"use client";
import { startTransition, useActionState, useId } from "react";
import { workCommandAction } from "@/modules/workbench/actions";
import { formatDateTime } from "@/lib/datetime";
import { taskSeconds, taskTimeLabel, type Progress } from "@/modules/workbench/schema";
export function WorkTaskRow({ id, version, phase, index, task, saved, editable, startedAt }: { id: string; version: number; phase: string; index: number; task: { trigger?: "timed" | "manual"; title: string; detail: string; minute: number; second?: number }; saved?: Progress[string]; editable: boolean; startedAt: string | null }) {
  const formId = useId(), [state, action, pending] = useActionState(workCommandAction, undefined);
  const time = (value: string) => formatDateTime(new Date(value), true);
  return <tr className="border-t align-top">
    {phase === "live" && <td className="p-3 text-sm"><p className="font-medium">{task.trigger === "manual" ? "按主播口令 / 随时执行" : `开播后 ${taskTimeLabel(task)}`}</p>{startedAt && task.trigger !== "manual" && <p className="mt-1 text-xs text-muted-foreground">{time(new Date(new Date(startedAt).getTime() + taskSeconds(task) * 1000).toISOString())}</p>}</td>}
    <td className="p-3"><p className="text-sm font-medium">{task.title}</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{task.detail}</p></td>
    <td className="p-3"><form id={formId} className="space-y-2" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; data.set("status", submitter ? submitter.name === "status" ? submitter.value : saved?.status ?? "pending" : data.has("done") ? "done" : "pending"); startTransition(() => action(data)); }}>
      {Object.entries({ id, version, command: "check", phase, index }).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
      <label className="flex items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" name="done" aria-label={`${task.title}完成`} checked={saved?.status === "done"} disabled={!editable || pending} className="size-4 accent-emerald-600" onChange={event => event.currentTarget.form?.requestSubmit()} />{saved?.status === "done" ? "已完成" : saved ? { issue: "已记录异常", skip: "不适用", done: "已完成", pending: "待完成" }[saved.status] : "待完成"}</label>
      {editable && <div className="flex flex-wrap gap-2"><button name="status" value="issue" disabled={pending} className="rounded border px-2 py-1 text-xs text-amber-800">标记异常</button><button name="status" value="skip" disabled={pending} className="rounded border px-2 py-1 text-xs">不适用</button>{saved && saved.status !== "pending" && <button name="status" value="pending" disabled={pending} className="text-xs underline">恢复待处理</button>}</div>}
      {saved && saved.status !== "pending" && <p className="text-xs leading-5 text-muted-foreground">{saved.actor}<br />{time(saved.at)}</p>}
      {pending && <p className="text-xs text-muted-foreground">保存中…</p>}{state?.error && <p role="alert" className="text-xs text-destructive">{state.error}</p>}
    </form></td>
    <td className="p-3">{editable ? <div className="space-y-2"><textarea form={formId} name="note" aria-label={`${task.title}备注`} defaultValue={saved?.note ?? ""} disabled={pending} maxLength={2000} rows={2} placeholder="执行备注；异常或不适用时必须说明原因" className="w-full min-w-32 rounded-lg border px-2 py-2 text-sm" /><button form={formId} disabled={pending} className="text-xs text-muted-foreground underline">保存备注</button></div> : <p className="whitespace-pre-wrap break-words text-sm">{saved?.note || "—"}</p>}</td>
  </tr>;
}
