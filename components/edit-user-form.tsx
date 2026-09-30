"use client";
import { NavigationFields } from "@/components/context-link";

import { startTransition, useState } from "react";
import { useActionState } from "react";
import { updateUserAction, type UserFormState } from "@/modules/users/actions";
import { UserRoleFields } from "@/components/user-role-fields";
import { Role } from "@/app/generated/prisma/enums";
import type { BranchOption } from "@/components/create-user-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm";

export function EditUserForm({
  userId,
  initialName,
  initialRole,
  initialRoles = [],
  initialBranchId,
  branches,
}: {
  userId: string;
  initialName: string;
  initialRole: Role;
  initialRoles?: Role[];
  initialBranchId: string | null;
  branches: BranchOption[];
}) {
  const [expectedRoles] = useState([...new Set([initialRole, ...initialRoles])].sort().join(","));
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(
    updateUserAction,
    undefined
  );

  return (
    <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); startTransition(() => formAction(form)); }} className="flex max-w-md flex-col gap-4">
      <NavigationFields /><input type="hidden" name="expectedRoles" value={expectedRoles} />
      <input type="hidden" name="userId" value={userId} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-name">姓名</Label>
        <Input id="edit-name" name="name" defaultValue={initialName} />
        {state?.fieldErrors?.name && (
          <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
        )}
      </div>

      <UserRoleFields initial={[initialRole, ...initialRoles]} error={state?.fieldErrors?.roles?.[0]} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-branch">所属分公司（勾选老板可不选）</Label>
          <select
            id="edit-branch"
            name="branchId"
            defaultValue={initialBranchId ?? ""}
            className={selectClass}
          >
            <option value="">请选择分公司</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {state?.fieldErrors?.branchId && (
            <p className="text-sm text-destructive">{state.fieldErrors.branchId[0]}</p>
          )}
        </div>


      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "保存中…" : "保存修改"}
      </Button>
    </form>
  );
}
