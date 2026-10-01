"use client";
import { startTransition, useActionState, useState, type ReactNode } from "react";
import { manageSessionAction } from "@/modules/workbench/actions";
import { NavigationFields } from "./context-link";
import { WorkEvidenceFields } from "./work-evidence-fields";
import { formatDateTime } from "@/lib/datetime";
const input = "w-full rounded-lg border px-3 py-2 text-sm";
export function SessionManagementForm({ children }: { children: ReactNode }) {
  const [state, action, pending] = useActionState(manageSessionAction, undefined);
  return <form className="space-y-3" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); startTransition(() => action(form)); }}><NavigationFields /><fieldset disabled={pending} className="space-y-3">{children}</fieldset>{state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}{state?.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}{pending && <p className="text-sm">保存中…</p>}</form>;
}
export function SessionRecycleForm({ id, version, deleted }: { id: string; version: number; deleted: boolean }) {
  return <details><summary className="cursor-pointer underline">{deleted ? "恢复" : "删除"}</summary><div className="min-w-56 space-y-2 py-3"><p className="text-xs">{deleted ? "仅恢复场次，不恢复关联数据。" : "移入回收站，原记录和截图保留。"}</p><SessionManagementForm><input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={version} /><input type="hidden" name="operation" value={deleted ? "restore" : "delete"} /><label className="block">操作原因<textarea name="reason" required maxLength={2000} className={input} /></label><button className="rounded border px-3 py-2">确认{deleted ? "恢复" : "删除"}</button></SessionManagementForm></div></details>;
}
type Choices = { accounts: { id: string; name: string; douyinId: string; records: { id: string; version: number; branchName: string; startedAt: Date; endedAt: Date | null }[] }[]; people: { id: string; name: string; employmentStatus: string }[] };
export function SessionSupplementForm({ id, accounts, people }: Choices & { id: string }) {
  const [accountId, setAccountId] = useState(""), [kind, setKind] = useState("complete");
  const account = accounts.find(a => a.id === accountId);
  return <SessionManagementForm><input type="hidden" name="command" value="supplement" /><input type="hidden" name="id" value={id} />
    <div className="grid gap-4 md:grid-cols-2"><label>抖音账号<select required name="accountId" className={input} value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">请选择</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.douyinId}</option>)}</select></label>
    <label>场次名称<input name="label" required maxLength={100} className={input} /></label>
    <label>记录类型<select name="kind" className={input} value={kind} onChange={e => setKind(e.target.value)}><option value="complete">已结束直播</option><option value="unstarted">未正常开播</option></select></label>
    <label>本场直播中控<select name="actualControllerId" required defaultValue="" className={input}><option value="">请选择实际员工（含历史员工）</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}{p.employmentStatus !== "ACTIVE" ? "（已离职）" : ""}</option>)}</select></label>
    <label>{kind === "complete" ? "实际开播时间" : "本场发生时间"}（北京时间）<input name="time" type="datetime-local" required className={input} /></label>
    {kind === "complete" && <label>实际下播时间（北京时间）<input name="endedAt" type="datetime-local" required className={input} /></label>}</div>
    <label className="block">历史归属版本<select key={accountId} name="sourceRecordId" required defaultValue="" className={input}><option value="">请选择本场对应的历史版本</option>{account?.records.map(r => <option key={r.id} value={r.id}>第{r.version}版 · {r.branchName} · {formatDateTime(r.startedAt)} 至 {r.endedAt ? formatDateTime(r.endedAt) : "现在"}</option>)}</select></label>
    <p className="text-xs text-muted-foreground">时间有对应历史版本时必须一致；早于系统历史或无对应版本时，请核实后明确选择。补录不生成检查完成记录，也不套用当前流程。</p>
    <div key={kind} className="space-y-3"><WorkEvidenceFields mode={kind === "complete" ? "end" : "unstarted"} /></div>
    <label className="block">补录原因<textarea name="reason" required maxLength={2000} className={input} /></label>
    <button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">确认补录</button>
  </SessionManagementForm>;
}
