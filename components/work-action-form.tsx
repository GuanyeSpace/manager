"use client";
import { startTransition, useActionState, useState, type ReactNode } from "react";
import { workCommandAction, dailyWorkAction } from "@/modules/workbench/actions";
export function WorkActionForm({ fields, children, daily = false, className = "flex flex-col gap-3" }: { fields: Record<string, string | number>; children: ReactNode; daily?: boolean; className?: string }) {
  const [uploadError, setUploadError] = useState("");
  const [initialVersion] = useState(fields.version);
  const [state, action, pending] = useActionState(daily ? dailyWorkAction : workCommandAction, undefined);
  return <form className={className} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); const files = data.getAll("screenshots").filter(v => v instanceof File && v.size > 0) as File[]; if (files.length > 6 || files.some(f => f.size > 5 * 1024 * 1024) || files.reduce((sum, f) => sum + f.size, 0) > 20 * 1024 * 1024) { setUploadError("最多 6 张截图，单张不超过 5MB，合计不超过 20MB"); return; } setUploadError(""); startTransition(() => action(data)); }}>
    {Object.entries(fields).map(([key, value]) => <input key={key} type="hidden" name={key} value={key === "version" && fields.command === "correct" ? state?.savedVersion ?? initialVersion : value} />)}
    <fieldset disabled={pending} className="contents">{children}</fieldset>
    {fields.command === "correct" && fields.version !== (state?.savedVersion ?? initialVersion) && <p className="text-sm text-amber-800">本场记录已更新。请保留需要的草稿后<button type="button" className="underline" onClick={() => window.location.reload()}>刷新页面</button>，再核对更正。</p>}
    {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state?.success && <p role="status" className="text-xs text-emerald-700">{state.success}</p>}
    {pending && <span className="text-xs text-muted-foreground">保存中…</span>}
  </form>;
}
