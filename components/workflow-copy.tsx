"use client";
import { startTransition, useActionState, useState } from "react";
import { copyWorkflowAction } from "@/modules/workbench/actions";
import { workflowParts, workflowPartLabels } from "@/modules/workbench/schema";
type Account = { id: string; name: string; branchName: string; version?: number };
export function WorkflowCopy({ accounts, currentId }: { accounts: Account[]; currentId?: string }) {
  const [sourceId, setSource] = useState(currentId ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [state, action, pending] = useActionState(copyWorkflowAction, undefined);
  const source = accounts.find(a => a.id === sourceId);
  return <details className="rounded-xl border bg-white p-5"><summary className="cursor-pointer font-semibold">复制配置 / 批量应用</summary><form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const content = { sourceId, sourceVersion: source?.version ?? 0, targets: accounts.filter(a => selected.includes(a.id)).map(a => ({ id: a.id, version: a.version ?? 0 })), parts: form.getAll("parts") }; const data = new FormData(); data.set("content", JSON.stringify(content)); startTransition(() => action(data)); }}>
    <p className="text-sm leading-6 text-muted-foreground">复制来源账号已保存的配置。选一个目标即为复制，选多个即可批量应用。只覆盖勾选的部分，其他配置保留；各账号以后独立修改，正在进行的场次不受影响。</p>
    <fieldset disabled={pending} className="space-y-4"><label className="block space-y-2 text-sm"><span>来源账号（需先保存配置）</span><select required value={sourceId} onChange={e => { setSource(e.target.value); setSelected([]); }} className="w-full rounded-lg border bg-background px-3 py-2"><option value="">请选择来源</option>{accounts.map(a => <option key={a.id} value={a.id} disabled={!a.version}>{a.name} · {a.branchName} · {a.version ? `第 ${a.version} 版` : "尚未配置"}</option>)}</select></label>
    <fieldset><legend className="mb-2 text-sm font-medium">要复制的内容</legend><div className="flex flex-wrap gap-4">{workflowParts.filter(part => part !== "materials").map(part => <label key={part} className="flex items-center gap-2 text-sm"><input type="checkbox" name="parts" value={part} defaultChecked={part !== "scripts"} />{workflowPartLabels[part]}</label>)}</div></fieldset>
    <fieldset><legend className="mb-2 text-sm font-medium">应用到哪些账号（最多 100 个）</legend><div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-3">{accounts.filter(a => a.id !== sourceId).map(a => <label key={a.id} className="flex items-start gap-3 rounded p-2 hover:bg-muted"><input type="checkbox" className="mt-1" checked={selected.includes(a.id)} onChange={e => setSelected(e.target.checked ? [...selected, a.id] : selected.filter(id => id !== a.id))} /><span className="text-sm">{a.name}<span className="ml-2 text-xs text-muted-foreground">{a.branchName} · {a.version ? `覆盖所选部分（现有第 ${a.version} 版）` : "首次配置，须包含三个阶段"}</span></span></label>)}</div></fieldset>
    <p className="text-sm">已选 {selected.length} 个目标：{accounts.filter(a => selected.includes(a.id)).map(a => a.name).join("、") || "尚未选择"}</p>
    <label className="flex items-start gap-2 text-sm"><input key={`${sourceId}:${selected.join()}`} type="checkbox" required className="mt-1" /><span>我已核对来源、目标和复制内容，确认覆盖目标账号的所选配置。</span></label>
    <button disabled={!source?.version || !selected.length || selected.length > 100} className="rounded-lg bg-primary px-5 py-2 text-sm text-primary-foreground">{pending ? "应用中…" : `应用到 ${selected.length} 个账号`}</button></fieldset>
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}{state?.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
  </form></details>;
}
