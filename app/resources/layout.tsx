import { ControllerShell } from "@/components/controller-shell";
import { isExecutionController } from "@/lib/auth/account-permissions";
import { ManagementShell } from "@/components/management-shell";
import { canAccessBossWorkspace } from "@/lib/auth/permissions";
import Link from "next/link";
import { requirePageUser, requirePasswordChanged, getWorkbenchPath } from "@/lib/auth/permissions";
export default async function ResourcesLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  if (isExecutionController(user)) return <ControllerShell name={user.name}>{children}</ControllerShell>;
  if (canAccessBossWorkspace(user)) return <ManagementShell name={user.name}>{children}</ManagementShell>;
  return <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-8"><nav className="flex flex-wrap gap-x-5 gap-y-3 border-b pb-4 text-sm"><Link href={getWorkbenchPath(user)} className="text-muted-foreground">← 我的首页</Link>{[["anchors", "主播管理"], ["rooms", "直播间管理"], ["numbers", "手机号管理"], ["phones", "手机管理"], ["equipment", "设备管理"], ["materials", "物资管理"]].map(([kind, label]) => <Link key={kind} href={`/resources/${kind}`}>{label}</Link>)}<Link href="/accounts">抖音账号</Link></nav>{children}</main>;
}
