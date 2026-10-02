"use client";
import { powderFields } from "@/modules/live-reports/input-metrics";
import { NavigationFields } from "@/components/context-link";

import { startTransition, useActionState, useState } from "react";
import { saveMonetizationAction } from "@/modules/live-reports/actions";
import { monetizationSchema, type MonetizationInput } from "@/modules/live-reports/monetization-schema";
import type { ReportFormState } from "@/modules/live-reports/schema";
import { Button } from "@/components/ui/button";
import { ReportMetricSections } from "./report-metric-sections";


export function MonetizationForm({ initial, embedded = false, entryCount }: { initial: MonetizationInput; embedded?: boolean; entryCount: number }) {
  const [state, action, pending] = useActionState<ReportFormState, FormData>(saveMonetizationAction, undefined);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});

  const [values, setValues] = useState<Record<string,string>>({ ...initial, leadMode:initial.leadMode ?? "", entryCount: String(entryCount) });
  const fieldErrors = { ...state?.fieldErrors, ...errors };

  return <form className="flex max-w-4xl flex-col gap-4 rounded-lg border p-5" onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = monetizationSchema.safeParse(Object.fromEntries(form));
    setErrors(result.success ? {} : result.error.flatten().fieldErrors);
    if (result.success) startTransition(() => action(form));
  }}>
    <input type="hidden" name="embedded" value={String(embedded)} />
    <NavigationFields /><input type="hidden" name="id" value={initial.id} /><input type="hidden" name="version" value={initial.version} />
    <h3 className="font-semibold">填写 / 更正打粉数据</h3>
    <p className="text-sm text-muted-foreground">可分次补填，暂未统计请留空，确为零时填 0。有效人数用于打粉结算，不代表实际收入。</p>
    <label className="text-sm">本场是否导粉<select name="leadMode" value={values.leadMode} onChange={e=>setValues(v=>({...v,leadMode:e.target.value}))} disabled={pending} className="block rounded border p-2"><option value="">历史未标记</option><option value="yes">导粉</option><option value="no">不导粉</option></select></label>
    {values.leadMode === "no" && <><p>本场不导粉，打粉指标不适用。</p>{powderFields.map(([key])=><input key={key} type="hidden" name={key} value={values[key]}/>)}</>}
    <ReportMetricSections values={values} onChange={(key,value) => setValues(v => ({ ...v, [key]: value }))} live={false} powder={values.leadMode !== "no"} disabled={pending} />
    {Object.entries(fieldErrors).map(([key,messages]) => messages?.[0] ? <p key={key} role="alert" className="text-sm text-destructive">{messages[0]}</p> : null)}
    <label className="text-sm">填写说明 / 更正原因<textarea name="reason" maxLength={2000} className="mt-1 w-full rounded border p-2" placeholder="更正已填数据时必须说明原因" /></label>
    {state?.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <Button type="submit" disabled={pending} className="self-start">{pending ? "保存中…" : "保存打粉数据"}</Button>
  </form>;
}
