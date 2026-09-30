"use client";
import { startTransition, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { recycleLiveReportAction } from "@/modules/live-reports/actions";
export function ReportRecycleForm({ id, version, section, restore = false }: { id: string; version: number; section: "report" | "monetization"; restore?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: Awaited<ReturnType<typeof recycleLiveReportAction>>, form: FormData) => { const result = await recycleLiveReportAction(previous, form); if (result?.success) router.refresh(); return result; }, undefined);
  const label = `${restore ? "恢复" : "删除"}${section === "report" ? "直播数据" : "打粉数据"}`;
  if (!open) return <button type="button" className={`text-sm underline underline-offset-4 ${restore ? "text-primary" : "text-destructive"}`} onClick={() => setOpen(true)}>{label}</button>;
  return <form className="max-w-md space-y-3 whitespace-normal rounded-lg border p-3 text-sm" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(() => action(data)); }}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={version} /><input type="hidden" name="section" value={section} /><input type="hidden" name="operation" value={restore ? "restore" : "delete"} />
    <p>{restore ? "恢复后将重新显示原有数据。" : section === "report" ? "本场直播数据及关联打粉数据将移入回收站，直播工作流程记录保留。" : "仅将本场打粉数据移入回收站，直播间指标保留。"}</p>
    <label className="block">操作原因<textarea name="reason" required maxLength={2000} className="mt-1 w-full rounded border p-2" /></label>
    <label className="flex items-start gap-2"><input type="checkbox" name="confirmed" value="yes" required disabled={pending} />我已核对，确认{label}</label>
    <div className="flex gap-4"><button disabled={pending} className="rounded border px-3 py-1">{pending ? "处理中…" : `确认${label}`}</button><button type="button" disabled={pending} onClick={() => setOpen(false)}>取消</button></div>
    {state?.error && <p role="alert" className="text-destructive">{state.error}</p>}{state?.success && <p role="status">{state.success}</p>}
  </form>;
}
