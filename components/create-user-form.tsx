"use client";

import { useActionState } from "react";
import { createUserAction, type UserFormState } from "@/modules/users/actions";
import { ROLE_LABELS } from "@/lib/auth/role-labels";
import { Role } from "@/app/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm";

export type BranchOption = { id: string; name: string };

export function CreateUserForm({ branches }: { branches: BranchOption[] }) {
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(
    createUserAction,
    undefined
  );

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="role">岗位</Label>
        <select id="role" name="role" defaultValue="" className={selectClass}>
          <option value="" disabled>
            请选择岗位
          </option>
          {Object.values(Role).map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        {state?.fieldErrors?.role && (
          <p className="text-sm text-destructive">{state.fieldErrors.role[0]}</p>
        )}
      </div>

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
