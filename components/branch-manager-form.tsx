"use client";

import { useActionState } from "react";
import { setBranchManagerAction } from "@/modules/accounts/actions";
import type { AccountFormState } from "@/modules/accounts/schema";
import { Button } from "@/components/ui/button";

export function BranchManagerForm({ branchId, managerId, people }: {
  branchId: string; managerId: string | null; people: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(setBranchManagerAction, undefined);
  return <form action={action} className="flex flex-wrap items-center gap-2">
    <input type="hidden" name="branchId" value={branchId} />
    <input type="hidden" name="previousManagerId" value={managerId ?? ""} />
    <label htmlFor={`manager-${branchId}`} className="text-sm">负责人</label>
    <select id={`manager-${branchId}`} name="managerId" defaultValue={managerId ?? ""} className="h-8 rounded-lg border px-2 text-sm">
      <option value="">未指定</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
    <Button size="sm" variant="outline" disabled={pending}>{pending ? "保存中…" : "保存负责人"}</Button>
    {state?.error && <p role="alert" className="w-full text-sm text-destructive">{state.error}</p>}
  </form>;
}
