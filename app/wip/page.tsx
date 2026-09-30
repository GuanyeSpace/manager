import { rolesLabel } from "@/lib/auth/roles";
import Link from "next/link";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { LogoutButton } from "@/components/logout-button";

// 占位工作台：运营/小助理/主播/财务等岗位暂时都到这里
export default async function WipPage() {
  const user = await requirePageUser();
  await requirePasswordChanged(user);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">你好，{user.name}</h1>
      <p className="text-muted-foreground">岗位：{rolesLabel(user)}</p>
      <p className="text-sm text-muted-foreground">功能开发中，敬请期待</p>
      <Link href="/account-config" className="rounded-lg border px-4 py-3 text-sm">抖音账号配置</Link><Link href="/workbench" className="rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted">直播工作台</Link>
      {[["anchors", "主播管理"], ["rooms", "直播间管理"], ["numbers", "手机号管理"], ["phones", "手机管理"], ["equipment", "设备管理"], ["materials", "物资管理"]].map(([kind, label]) => <Link key={kind} href={`/resources/${kind}`} className="rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted">{label}</Link>)}
        <Link href="/accounts" className="rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted">抖音账号</Link>
      <Link href="/leads" className="rounded-lg border px-4 py-3 text-sm">导粉场次与数据</Link>
      <Link href="/live-reports" className="rounded-lg border px-4 py-3 text-sm">直播数据</Link>
      <LogoutButton />
    </main>
  );
}
