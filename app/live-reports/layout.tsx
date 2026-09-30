import { notFound } from "next/navigation";
import { canViewLiveReports } from "@/lib/auth/live-report-permissions";
import { ManagementShell } from "@/components/management-shell";
import { canAccessBossWorkspace } from "@/lib/auth/permissions";
import Link from "next/link";
import { requirePageUser, requirePasswordChanged, getWorkbenchPath } from "@/lib/auth/permissions";
import { LogoutButton } from "@/components/logout-button";

export default async function LiveReportsLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  if (!canViewLiveReports(user)) notFound();
  if (canAccessBossWorkspace(user)) return <ManagementShell name={user.name}>{children}</ManagementShell>;
  return <main className="flex flex-1 flex-col gap-6 p-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><nav className="flex flex-wrap gap-4 text-sm">
      <Link href={getWorkbenchPath(user)}>← 工作台</Link><Link href="/live-reports">直播数据</Link><Link href="/accounts">抖音账号</Link>
    </nav><div className="flex items-center gap-4"><span className="text-sm text-muted-foreground">{user.name}</span><LogoutButton /></div></header>
    {children}
  </main>;
}
