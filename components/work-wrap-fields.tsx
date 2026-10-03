"use client";
import { useState } from "react";
import { ScreenshotInput } from "./work-evidence-fields";
const inputClass = "w-full rounded-lg border px-3 py-2 text-sm";
export function WorkWrapFields({ interrupted, hasViolation, hasOtherIncident, note, evidenceCount, evidence = [], outcomeLabel, correcting = false, initialIncident }: { interrupted: boolean; hasViolation: boolean | null; hasOtherIncident: boolean | null; note: string; evidenceCount: number; evidence?: { id: string }[]; outcomeLabel?: string; correcting?: boolean; initialIncident?: boolean | null }) {
  const locked = !correcting && (interrupted || !!hasViolation);
  const [incident, setIncident] = useState(initialIncident === false ? "no" : initialIncident || locked || hasOtherIncident ? "yes" : "");
  const [violation, setViolation] = useState(!!hasViolation), [other, setOther] = useState(interrupted || !!hasOtherIncident);
  const [supplement, setSupplement] = useState(false);
  if (locked && !supplement) return <div className="space-y-3">
    <p className="font-medium">{outcomeLabel ?? (hasViolation ? "已记录违规" : "已记录异常下播")}</p>
    <p className="whitespace-pre-wrap text-sm">{note}</p>
    <input type="hidden" name="incident" value="yes" /><input type="hidden" name="violation" value={hasViolation ? "yes" : "no"} /><input type="hidden" name="otherIncident" value={interrupted || hasOtherIncident ? "yes" : "no"} /><input type="hidden" name="note" value={note} />
    <div className="flex flex-wrap gap-3">{evidence.map((file,i)=><a key={file.id} href={`/workbench/screenshots/${file.id}`} target="_blank" rel="noreferrer" className="text-sm underline">查看已有截图 {i+1}</a>)}</div>
    <p className="text-xs text-muted-foreground">已有异常说明与截图将直接沿用，无需重复填写。</p>
    <button type="button" className="text-sm underline" onClick={()=>setSupplement(true)}>补充异常／截图</button>
  </div>;
  return <><label className="text-sm">本场是否有异常？<select name="incident" value={incident} required disabled={locked} onChange={e => setIncident(e.target.value)} className={inputClass}><option value="" disabled>请选择</option><option value="no">无异常</option><option value="yes">有异常</option></select></label>{locked && <input type="hidden" name="incident" value="yes" />}
    {incident === "yes" && <><fieldset className="space-y-2 text-sm"><legend>异常类型（可多选）</legend><label className="mr-4 inline-flex gap-2"><input type="checkbox" checked={violation} disabled={!correcting && !!hasViolation} onChange={e => setViolation(e.target.checked)} />违规</label><label className="inline-flex gap-2"><input type="checkbox" checked={other} disabled={!correcting && interrupted} onChange={e => setOther(e.target.checked)} />其他异常</label></fieldset><input type="hidden" name="violation" value={violation ? "yes" : "no"} /><input type="hidden" name="otherIncident" value={other ? "yes" : "no"} /><label className="text-sm">异常说明（必填）<textarea name="note" required defaultValue={note} maxLength={2000} rows={3} className={inputClass} /></label>{evidenceCount > 0 && <p className="text-xs text-muted-foreground">已关联本场异常下播或违规截图 {evidenceCount} 张，无需重复上传，可在本场全部截图查看。</p>}<ScreenshotInput required={violation && !evidenceCount} />{locked && <p className="text-xs text-muted-foreground">已有异常下播或违规记录已带入；误报请完成收尾后通过更正处理。</p>}</>}
  </>;
}
