"use client";
import { NavigationFields } from "@/components/context-link";

import { startTransition, useActionState, useState } from "react";
import { saveLiveReportAction } from "@/modules/live-reports/actions";
import { metricFields, reportSchema, percentage, type ReportInput, type ReportFormState } from "@/modules/live-reports/schema";
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
  const [ratios, setRatios] = useState({ exposure: initial?.exposureCount ?? "", entries: initial?.entryCount ?? "", followers: initial?.newFollowers ?? "" });
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
        <fieldset><legend className="mb-2 text-sm font-medium">直播时长</legend><div className="grid grid-cols-3 gap-2">
          {([['durationHours','小时',999],['durationMinutes','分钟',59],['durationSeconds','秒',59]] as const).map(([key,label,max]) => <div key={key}>
            <Input aria-label={`直播时长${label}`} name={key} type="number" min="0" max={max} step="1" required defaultValue={initial?.[key] ?? workDefaults?.[key] ?? "0"} /><span className="text-xs text-muted-foreground">{label}</span>{errorFor(key)}
          </div>)}
        </div></fieldset>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">同一账号、同一开播时间只记录一次。保存前请核对账号与开播时间，保存后这两项不可修改。</p>
    </section>
    <section className="rounded-lg border p-5"><h2 className="mb-4 text-lg font-semibold">直播数据</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {metricFields.map(([key,label]) => <div key={key} className="flex flex-col gap-2"><Label htmlFor={key}>{label}</Label>
        <Input id={key} name={key} type="number" min="0" max="2000000000" step="1" required defaultValue={initial?.[key] ?? ""} placeholder="请输入，确为零时填 0" onChange={(e) => {
          const value = e.target.value;
          if (key === "exposureCount") setRatios((v) => ({ ...v, exposure: value }));
          if (key === "entryCount") setRatios((v) => ({ ...v, entries: value }));
          if (key === "newFollowers") setRatios((v) => ({ ...v, followers: value }));
        }} />{errorFor(key)}
      </div>)}
      <div className="flex flex-col gap-2"><Label htmlFor="averageStayMinutes">人均停留（分钟）</Label><Input id="averageStayMinutes" name="averageStayMinutes" type="number" required min="0" max="59940" step="0.01" defaultValue={initial?.averageStayMinutes ?? ""} placeholder="例如 2.9" />{errorFor("averageStayMinutes")}</div>
    </div>
    <div className="mt-5 grid gap-3 rounded-lg bg-muted p-4 text-sm sm:grid-cols-2" aria-live="polite">
      <p>进房率：<strong>{ratios.exposure && ratios.entries ? percentage(Number(ratios.entries), Number(ratios.exposure)) : "—"}</strong><span className="ml-2 text-xs text-muted-foreground">进房人数 ÷ 曝光人数</span></p>
      <p>新增率：<strong>{ratios.entries && ratios.followers ? percentage(Number(ratios.followers), Number(ratios.entries)) : "—"}</strong><span className="ml-2 text-xs text-muted-foreground">新增粉丝 ÷ 进房人数</span></p>
    </div><p className="mt-3 text-xs text-muted-foreground">所有指标手工录入；未填写不等于 0。分母为 0 时比例显示“—”。</p></section>
    {boss && !initial && <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmBackfill" value="true" className="mt-1" /><span>补录账号建档前的数据时，我已核对并同意按账号建档时的分公司和人员归属记录。</span></label>}
    {initial?.id && <label className="text-sm">更正原因<textarea name="reason" required maxLength={2000} className="mt-1 w-full rounded border p-2" /></label>}
    {state?.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <Button type="submit" disabled={pending || !accounts.length} className="self-start">{pending ? "保存中…" : initial ? "保存更正" : "保存本场数据"}</Button>
  </form>;
}
