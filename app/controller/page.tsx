import { requireControllerPage } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/role-labels";
import { LogoutButton } from "@/components/logout-button";

// 中控工作台（空壳）：只显示问候与岗位
export default async function ControllerPage() {
  const user = await requireControllerPage();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">
        你好，{user.name}
      </h1>
      <p className="text-muted-foreground">岗位：{ROLE_LABELS[user.role]}</p>
      <p className="text-sm text-muted-foreground">中控工作台功能开发中</p>
      <LogoutButton />
    </main>
  );
}
