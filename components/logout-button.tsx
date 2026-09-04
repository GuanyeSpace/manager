"use client";

import { logoutAction } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";

// 工作台页共用的退出按钮（服务端动作表单）
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button variant="outline" type="submit">
        退出登录
      </Button>
    </form>
  );
}
