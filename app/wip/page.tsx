import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/role-labels";
import { LogoutButton } from "@/components/logout-button";

// 占位工作台：运营/场控/主播/财务等岗位暂时都到这里
export default async function WipPage() {
  const user = await requirePageUser();
  await requirePasswordChanged(user);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">你好，{user.name}</h1>
      <p className="text-muted-foreground">岗位：{ROLE_LABELS[user.role]}</p>
      <p className="text-sm text-muted-foreground">功能开发中，敬请期待</p>
      <LogoutButton />
    </main>
  );
}
