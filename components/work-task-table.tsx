"use client";
import { useRef, useState } from "react";
import { saveWorkCheckAction } from "@/modules/workbench/actions";
import { formatDateTime } from "@/lib/datetime";
import { phaseLabels, taskSeconds, taskTimeLabel, type Progress, type Workflow } from "@/modules/workbench/schema";
export function WorkTaskTable({ id, version, phase, tasks, progress, editable, startedAt }: { id: string; version: number; phase: keyof typeof phaseLabels; tasks: Workflow["before"]; progress: Progress; editable: boolean; startedAt: string | null }) {
  const [snapshot, setSnapshot] = useState({ version, progress });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const saving = useRef(false);
  if (version > snapshot.version) setSnapshot({ version, progress });
  async function toggle(index: number, done: boolean) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const form = new FormData();
      for (const [key, value] of Object.entries({ id, version: snapshot.version, phase, index, status: done ? "done" : "pending" })) form.set(key, String(value));
      const result = await saveWorkCheckAction(form);
      if (result.saved) setSnapshot(result.saved); else setError(result.error ?? "保存失败，请重试");
    } catch { setError("保存失败，请重试；完成状态未变更"); }
    finally { saving.current = false; setBusy(false); }
  }
  return <section className="overflow-hidden rounded-xl border bg-white"><h2 className="p-4 font-semibold">{phaseLabels[phase]} · 共 {tasks.length} 项</h2><div className="overflow-x-auto"><table className="w-full min-w-[420px] table-fixed text-left"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{phase === "live" && <th className="w-[25%] p-3">开播时间</th>}<th className="p-3">工作内容</th><th className="w-[30%] p-3">完成情况 / 完成时间</th></tr></thead><tbody>{tasks.map((task, index) => {
    const saved = snapshot.progress[`${phase}:${index}`];
    return <tr key={index} className="border-t align-top">{phase === "live" && <td className="p-3 text-sm">{task.trigger === "manual" ? "按主播口令 / 随时执行" : `开播后 ${taskTimeLabel(task)}`}{startedAt && task.trigger !== "manual" && <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(new Date(new Date(startedAt).getTime() + taskSeconds(task) * 1000), true)}</p>}</td>}<td className="p-3"><p className="text-sm font-medium">{task.title}</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{task.detail}</p>{saved && (saved.note || ["issue", "skip"].includes(saved.status)) && <details className="mt-2 text-xs text-muted-foreground"><summary>历史记录</summary><p>{saved.status === "issue" ? "异常" : saved.status === "skip" ? "不适用" : "原备注"}：{saved.note || "无备注"}</p></details>}</td><td className="p-3"><input type="checkbox" aria-label={`${task.title}完成`} checked={saved?.status === "done"} disabled={!editable || busy} onChange={e => { void toggle(index, e.target.checked); }} className="size-4 accent-emerald-600" />{saved?.status === "done" && <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(new Date(saved.at), true)}</p>}</td></tr>;
  })}</tbody></table></div>{!tasks.length && <p className="p-4 text-sm text-muted-foreground">本阶段未配置事项</p>}{busy && <p role="status" className="p-3 text-xs">保存中…</p>}{error && <p role="alert" className="p-3 text-sm text-destructive">{error}</p>}</section>;
}
