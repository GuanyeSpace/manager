"use client";
import { NavigationFields } from "@/components/context-link";

import { startTransition, useActionState } from "react";
import { createUserAction, type UserFormState } from "@/modules/users/actions";
import { UserRoleFields } from "@/components/user-role-fields";
import { Role } from "@/app/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm";

export type BranchOption = { id: string; name: string };

export function CreateUserForm({ branches, defaultRole }: { branches: BranchOption[]; defaultRole?: Role }) {
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(
    createUserAction,
    undefined
  );

  return (
    <form className="flex max-w-md flex-col gap-4" onSubmit={(event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startTransition(() => formAction(formData));
    }}>
      <NavigationFields /><div className="flex flex-col gap-2">
        <Label htmlFor="name">姓名</Label>
        <Input id="name" name="name" placeholder="例如：张三" />
        {state?.fieldErrors?.name && (
          <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="username">用户名（登录账号，创建后不可修改）</Label>
        <Input id="username" name="username" placeholder="字母、数字、下划线" />
        {state?.fieldErrors?.username && (
          <p className="text-sm text-destructive">{state.fieldErrors.username[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="initialPassword">初始密码（用户首次登录会被强制修改）</Label>
        <Input id="initialPassword" name="initialPassword" type="password" />
        {state?.fieldErrors?.initialPassword && (
          <p className="text-sm text-destructive">{state.fieldErrors.initialPassword[0]}</p>
        )}
      </div>

      <UserRoleFields initial={defaultRole ? [defaultRole] : []} error={state?.fieldErrors?.roles?.[0]} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="branchId">所属分公司（老板跨分公司，可不选）</Label>
        <select id="branchId" name="branchId" defaultValue="" className={selectClass}>
          <option value="">不选（仅老板）</option>
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
        {pending ? "创建中…" : "创建用户"}
      </Button>
    </form>
  );
}
