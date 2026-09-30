"use client";
import { NavigationFields } from "@/components/context-link";
import { startTransition, useActionState } from "react";
import { splitMaterialAction } from "@/modules/resources/actions";
import { itemCodes, type ResourceInput } from "@/modules/resources/schema";
export function MaterialSplitForm({ initial }: { initial: ResourceInput }) {
  const [state, action, pending] = useActionState(splitMaterialAction, undefined);
  const quantity = Number(initial.quantity);
  return <details className="rounded-xl border p-5"><summary className="cursor-pointer font-semibold">拆分为单件物资（一物一码）</summary><form className="mt-4 space-y-4" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => action(data)); }}>
    <NavigationFields /><input type="hidden" name="id" value={initial.id} /><input type="hidden" name="version" value={initial.version} />
    <p className="text-sm leading-6">生成 {quantity} 件独立物资，数量、购入总额和估值总额保持不变。先继承当前归属，拆分后逐件设置使用人和直播间；序列号需按实物分别填写。原批次保留为只读来源，不再计入存量。</p>
    <p className="break-words rounded-lg bg-muted/50 p-3 text-sm">单件编号：{itemCodes(initial.code, quantity).join("、")}</p>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmed" value="yes" required disabled={pending} /><span>我已核对数量与编号，确认拆分后按单件维护。</span></label>
    {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <button disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">{pending ? "拆分中…" : "确认拆分"}</button>
  </form></details>;
}
