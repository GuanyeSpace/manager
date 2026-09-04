import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/role-labels";
import { logoutAction } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";

// 临时首页：只用来验证登录/会话/退出链路。
// commit 5 会把它换成按岗位跳转的工作台入口。
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
      <h1 className="text-2xl font-semibold">
        你好，{user.name}（{ROLE_LABELS[user.role]}）
      </h1>
      <p className="text-sm text-muted-foreground">
        登录与会话验证已生效；工作台路由在后续步骤实现
      </p>
      <form action={logoutAction}>
        <Button variant="outline" type="submit">
          退出登录
        </Button>
      </form>
    </main>
  );
}
