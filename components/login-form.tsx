"use client";

import { useActionState, useState } from "react";
import { loginAction, type LoginFormState } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginForm() {
  const [rememberMe, setRememberMe] = useState(true);
  const [username, setUsername] = useState("");
  const [state, formAction, pending] = useActionState<LoginFormState, FormData>(
    loginAction,
    undefined
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>登录</CardTitle>
        <CardDescription>公司内部管理系统</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">用户名</Label>
            <Input id="username" name="username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} />
            {state?.fieldErrors?.username && (
              <p className="text-sm text-destructive">{state.fieldErrors.username[0]}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">密码</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" />
            {state?.fieldErrors?.password && (
              <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="rememberMe" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />在这台设备上保持登录</label>
          <p className="text-xs text-muted-foreground">仅适用于当前浏览器；无痕模式或清除浏览器数据后需重新登录。</p>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "登录中…" : "登录"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
