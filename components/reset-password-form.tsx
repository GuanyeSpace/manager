"use client";

import { useActionState } from "react";
import { resetPasswordAction, type UserFormState } from "@/modules/users/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(
    resetPasswordAction,
    undefined
  );

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-password">新密码（重置后该用户需重新登录并强制改密）</Label>
        <Input id="reset-password" name="newPassword" type="password" />
        {state?.fieldErrors?.newPassword && (
          <p className="text-sm text-destructive">{state.fieldErrors.newPassword[0]}</p>
        )}
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "重置中…" : "重置密码"}
      </Button>
    </form>
  );
}
