"use client";
import { useState } from "react";
const inputClass = "w-full rounded-lg border px-3 py-2 text-sm";
export function ScreenshotInput({ required = true }: { required?: boolean }) {
  return <label className="block space-y-2 text-sm"><span>截图（{required ? "必填" : "选填"}，可多选）</span><input type="file" name="screenshots" accept="image/png,image/jpeg,image/webp" multiple required={required} className={inputClass} /><span className="block text-xs text-muted-foreground">最多 6 张，每张不超过 5MB，合计不超过 20MB；支持 PNG、JPG、WebP。保存成功后可在本场记录查看。</span></label>;
}
export function WorkEvidenceFields({ mode, initialViolation = "", initialNote = "" }: { mode: "end" | "violation" | "unstarted" | "wrap"; initialViolation?: string; initialNote?: string }) {
  const [choice, setChoice] = useState(mode === "end" ? "normal" : mode === "violation" ? initialViolation : "");
  const evidence = mode === "unstarted" || mode === "end" && choice === "interrupted" || mode === "violation" && choice === "yes";
  const reason = evidence || mode === "wrap" && choice === "yes";
  return <>
    {mode === "unstarted" ? <><label className="space-y-2 text-sm">未开播原因类型<select name="failureReason" required defaultValue="" className={inputClass}><option value="" disabled>请选择</option>{["人脸验证未通过", "账号封禁", "设备故障", "主播原因", "其他"].map(v => <option key={v}>{v}</option>)}</select></label></> : <label className="space-y-2 text-sm"><span>{mode === "end" ? "下播方式" : mode === "violation" ? "本场是否违规？" : "本场是否有异常？"}</span><select name={mode === "end" ? "endKind" : mode === "violation" ? "violation" : "incident"} required value={choice} onChange={e => setChoice(e.target.value)} className={inputClass}><option value="" disabled>请选择</option>{mode === "end" ? <><option value="normal">正常下播</option><option value="interrupted">异常中断</option></> : <><option value="no">{mode === "violation" ? "无违规" : "无异常"}</option><option value="yes">{mode === "violation" ? "有违规" : "有异常"}</option></>}</select></label>}
    {(reason || choice === "yes") && <label className="space-y-2 text-sm"><span>{reason ? "具体原因及处理情况（必填）" : "说明"}</span><textarea name="note" required={reason} defaultValue={initialNote} maxLength={2000} rows={3} className={inputClass} /></label>}
    {evidence && <ScreenshotInput />}
  </>;
}
