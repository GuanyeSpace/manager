import { ControllerShell } from "@/components/controller-shell";
import { isExecutionController } from "@/lib/auth/account-permissions";
import { getConfigAccounts } from "@/modules/workbench/queries";
import { ManagementShell } from "@/components/management-shell";
import { canAccessBossWorkspace } from "@/lib/auth/permissions";
import Link from "next/link";
import { requirePageUser, requirePasswordChanged, getWorkbenchPath } from "@/lib/auth/permissions";
export default async function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  if (isExecutionController(user)) return <ControllerShell name={user.name}>{children}</ControllerShell>;
  if (canAccessBossWorkspace(user)) return <ManagementShell name={user.name}>{children}</ManagementShell>;
  const configurable = (await getConfigAccounts()).length > 0;
  return <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-8"><nav className="flex flex-wrap gap-5 text-sm text-muted-foreground"><Link href={getWorkbenchPath(user)}>← 我的首页</Link><Link href="/workbench">直播工作台</Link>{configurable && <Link href="/account-config">账号配置</Link>}<Link href="/workbench/history">场次记录</Link><Link href="/live-reports">直播数据</Link><Link href="/resources/rooms">直播间与物资</Link></nav>{children}</main>;
}
