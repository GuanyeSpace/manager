"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordFormState } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, formAction, pending] = useActionState<ChangePasswordFormState, FormData>(
    changePasswordAction,
    undefined
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>修改密码</CardTitle>
        <CardDescription>
          {forced ? "首次登录请先设置一个新密码，然后才能进入系统" : "设置一个新密码（至少 8 位）"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {!forced && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="oldPassword">旧密码</Label>
              <Input
                id="oldPassword"
                name="oldPassword"
                type="password"
                autoComplete="current-password"
              />
              {state?.fieldErrors?.oldPassword && (
                <p className="text-sm text-destructive">{state.fieldErrors.oldPassword[0]}</p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="newPassword">新密码</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
            />
            {state?.fieldErrors?.newPassword && (
              <p className="text-sm text-destructive">{state.fieldErrors.newPassword[0]}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword">确认新密码</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
            />
            {state?.fieldErrors?.confirmPassword && (
              <p className="text-sm text-destructive">{state.fieldErrors.confirmPassword[0]}</p>
            )}
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "提交中…" : "确认修改"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
