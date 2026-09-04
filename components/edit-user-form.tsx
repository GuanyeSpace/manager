"use client";

import { useState } from "react";
import { useActionState } from "react";
import { updateUserAction, type UserFormState } from "@/modules/users/actions";
import { ROLE_LABELS } from "@/lib/auth/role-labels";
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
  initialBranchId,
  branches,
}: {
  userId: string;
  initialName: string;
  initialRole: Role;
  initialBranchId: string | null;
  branches: BranchOption[];
}) {
  const [role, setRole] = useState<Role>(initialRole);
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(
    updateUserAction,
    undefined
  );

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <input type="hidden" name="userId" value={userId} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-name">姓名</Label>
        <Input id="edit-name" name="name" defaultValue={initialName} />
        {state?.fieldErrors?.name && (
          <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-role">岗位</Label>
        <select
          id="edit-role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className={selectClass}
        >
          {Object.values(Role).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        {state?.fieldErrors?.role && (
          <p className="text-sm text-destructive">{state.fieldErrors.role[0]}</p>
        )}
      </div>

      {role !== Role.BOSS && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-branch">所属分公司</Label>
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
      )}
      {role === Role.BOSS && (
        <p className="text-sm text-muted-foreground">老板跨分公司，无需选择所属分公司</p>
      )}

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "保存中…" : "保存修改"}
      </Button>
    </form>
  );
}
