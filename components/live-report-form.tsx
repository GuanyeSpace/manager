"use client";
import { NavigationFields } from "@/components/context-link";

import { startTransition, useActionState, useState } from "react";
import { saveLiveReportAction } from "@/modules/live-reports/actions";
import { reportSchema, type ReportInput, type ReportFormState } from "@/modules/live-reports/schema";
import { ReportMetricSections } from "./report-metric-sections";
import { durationFromParts } from "@/modules/live-reports/input-metrics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LiveReportForm({ accounts, initial, defaultAccountId = "", boss = false, workDefaults, embedded = false }: {
  embedded?: boolean;
  workDefaults?: { id: string; accountId: string; startedAt: string; sessionLabel: string; durationHours: string; durationMinutes: string; durationSeconds: string };
  accounts: { id: string; name: string; douyinId: string }[]; initial?: ReportInput; defaultAccountId?: string; boss?: boolean;
}) {
  const [state, action, pending] = useActionState<ReportFormState, FormData>(saveLiveReportAction, undefined);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [values, setValues] = useState<Record<string,string>>(() => ({ ...initial, durationText: initial?.durationText ?? durationFromParts((initial ?? workDefaults ?? {}) as Record<string,unknown>) } as Record<string,string>));
  const fieldErrors = { ...state?.fieldErrors, ...errors };
  const errorFor = (key: string) => fieldErrors[key]?.[0] ? <p className="text-sm text-destructive">{fieldErrors[key]?.[0]}</p> : null;
  return <form className="flex max-w-4xl flex-col gap-6" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = reportSchema.safeParse(Object.fromEntries(data));
    setErrors(result.success ? {} : result.error.flatten().fieldErrors);
    if (result.success) startTransition(() => action(data));
  }}>
    <input type="hidden" name="embedded" value={String(embedded)} />
    <input type="hidden" name="workSessionId" value={initial?.workSessionId ?? workDefaults?.id ?? ""} />
    <NavigationFields /><input type="hidden" name="id" value={initial?.id ?? ""} /><input type="hidden" name="version" value={initial?.version ?? "0"} />
    <section className="rounded-lg border p-5">
      <h2 className="mb-4 text-lg font-semibold">场次信息</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2"><Label htmlFor="accountId">直播账号</Label>
          {initial || workDefaults ? <><input type="hidden" name="accountId" value={initial?.accountId ?? workDefaults?.accountId} /><p>{accounts[0]?.name} · {accounts[0]?.douyinId}</p></> :
            <select id="accountId" name="accountId" required defaultValue={defaultAccountId} className="h-9 w-full min-w-0 rounded-lg border px-2 text-sm">
              <option value="" disabled>请选择账号</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.douyinId}</option>)}
            </select>}{errorFor("accountId")}
        </div>
        <div className="flex flex-col gap-2"><Label htmlFor="startedAt">开播时间（北京时间）</Label>
          <Input id="startedAt" name="startedAt" type="datetime-local" required readOnly={!!initial || !!workDefaults} defaultValue={initial?.startedAt ?? workDefaults?.startedAt} />{errorFor("startedAt")}
        </div>
        <div className="flex flex-col gap-2"><Label htmlFor="sessionLabel">场次</Label><Input id="sessionLabel" name="sessionLabel" list="session-labels" required maxLength={30} placeholder="例如：晚上场" defaultValue={initial?.sessionLabel ?? workDefaults?.sessionLabel} />
          <datalist id="session-labels"><option value="早上场" /><option value="下午场" /><option value="晚上场" /></datalist>{errorFor("sessionLabel")}
        </div>

      </div>
      <p className="mt-3 text-xs text-muted-foreground">同一账号、同一开播时间只记录一次。保存前请核对账号与开播时间，保存后这两项不可修改。</p>
    </section>
    <ReportMetricSections values={values} onChange={(key,value) => setValues(v => ({ ...v, [key]: value }))} disabled={pending} completed={!!initial} />
    {Object.entries(fieldErrors).map(([key,messages]) => messages?.[0] ? <p key={key} role="alert" className="text-sm text-destructive">{messages[0]}</p> : null)}
    {boss && !initial && <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmBackfill" value="true" className="mt-1" /><span>补录账号建档前的数据时，我已核对并同意按账号建档时的分公司和人员归属记录。</span></label>}
    {initial?.id && <label className="text-sm">更正原因<textarea name="reason" required maxLength={2000} className="mt-1 w-full rounded border p-2" /></label>}
    {state?.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <Button type="submit" disabled={pending || !accounts.length} className="self-start">{pending ? "保存中…" : initial ? "保存更正" : "保存本场数据"}</Button>
  </form>;
}
