"use client";
import { NavigationFields } from "@/components/context-link";

import { startTransition, useActionState, useState } from "react";
import { saveMonetizationAction } from "@/modules/live-reports/actions";
import { monetizationFields, monetizationSchema, type MonetizationInput } from "@/modules/live-reports/monetization-schema";
import type { ReportFormState } from "@/modules/live-reports/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MonetizationForm({ initial, embedded = false }: { initial: MonetizationInput; embedded?: boolean }) {
  const [state, action, pending] = useActionState<ReportFormState, FormData>(saveMonetizationAction, undefined);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});

  const fieldErrors = { ...state?.fieldErrors, ...errors };
  const errorFor = (key: string) => fieldErrors[key]?.[0] ? <p className="text-sm text-destructive">{fieldErrors[key]?.[0]}</p> : null;
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {monetizationFields.map(([key, label]) => <div key={key} className="flex flex-col gap-2">
        <Label htmlFor={key}>{label}</Label><Input id={key} name={key} type="number" min="0" max="2000000000" step="1" defaultValue={initial[key]} placeholder="暂未统计可留空" />{errorFor(key)}
      </div>)}
    </div>
    <p className="text-xs text-muted-foreground">长按：打开卡片二维码后，长按识别并进入添加微信步骤。后端加入：最终加入人数。有效人数：其中审核通过、可用于打粉结算的人数。</p>
    <input type="hidden" name="salesStatus" value={initial.salesStatus} /><input type="hidden" name="salesGmv" value={initial.salesGmv} />
    <label className="text-sm">填写说明 / 更正原因<textarea name="reason" maxLength={2000} className="mt-1 w-full rounded border p-2" placeholder="更正已填数据时必须说明原因" /></label>
    {state?.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <Button type="submit" disabled={pending} className="self-start">{pending ? "保存中…" : "保存打粉数据"}</Button>
  </form>;
}
