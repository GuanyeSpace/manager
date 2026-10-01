"use client";
import { useState } from "react";
import { phases, phaseLabels, type Workflow, type Progress } from "@/modules/workbench/schema";
import { WorkActionForm } from "./work-action-form";
const inputClass = "w-full rounded-lg border px-3 py-2 text-sm";
export function WorkTaskCorrection({ fields, workflow, progress, cancelled }: { fields: Record<string, string | number>; workflow: Workflow; progress: Progress; cancelled: boolean }) {
  const options = phases.filter(p => !cancelled || p === "before").flatMap(phase => workflow[phase].map((task, index) => ({ key: `${phase}:${index}`, phase, index, label: `${phaseLabels[phase]} · ${task.title}` })));
  const [selected, setSelected] = useState(options[0]?.key ?? "");
  const item = options.find(option => option.key === selected);
  if (!item) return null;
  const saved = progress[selected];
  return <details className="rounded-lg border p-4"><summary className="mb-3 cursor-pointer text-sm font-medium">更正事项完成情况 / 备注</summary><label className="mb-3 block text-sm">选择事项<select value={selected} onChange={e => setSelected(e.target.value)} className={inputClass}>{options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label><WorkActionForm key={selected} fields={{ ...fields, kind: "task", phase: item.phase, index: item.index }}><label className="text-sm">更正后的状态<select name="status" defaultValue={saved?.status ?? "pending"} className={inputClass}><option value="pending">待完成</option><option value="done">完成</option><option value="issue">异常</option><option value="skip">不适用</option></select></label><label className="text-sm">执行备注（异常或不适用时必填）<textarea name="note" defaultValue={saved?.note ?? ""} maxLength={2000} className={inputClass} /></label><p className="text-xs text-muted-foreground">只改备注保留原操作时间；更正状态由系统记录当前时间，原状态和时间保留在修改历史中。</p><label className="text-sm">更正原因（必填）<textarea name="reason" required maxLength={2000} className={inputClass} /></label><button className="rounded-lg border px-4 py-2 text-sm">保存事项更正</button></WorkActionForm></details>;
}
