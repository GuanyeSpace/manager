"use client";

import { useActionState } from "react";
import { createBranchAction, type BranchFormState } from "@/modules/branches/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateBranchForm() {
  const [state, formAction, pending] = useActionState<BranchFormState, FormData>(
    createBranchAction,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Input name="name" placeholder="新分公司名称" className="max-w-xs" />
        <Button type="submit" disabled={pending}>
          {pending ? "创建中…" : "新增分公司"}
        </Button>
      </div>
      {state?.fieldErrors?.name && (
        <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
      )}
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
