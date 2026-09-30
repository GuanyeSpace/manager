import Link from "next/link";
import { requirePageUser, requirePasswordChanged, canAccessBossWorkspace, getWorkbenchPath } from "@/lib/auth/permissions";
import { ManagementShell } from "@/components/management-shell";
export default async function ConfigLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  if (canAccessBossWorkspace(user)) return <ManagementShell name={user.name}>{children}</ManagementShell>;
  return <main className="mx-auto w-full max-w-6xl space-y-6 p-6"><nav className="flex gap-5 text-sm"><Link href={getWorkbenchPath(user)}>← 我的首页</Link><Link href="/account-config">抖音账号配置</Link></nav>{children}</main>;
}
