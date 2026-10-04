import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser, requirePasswordChanged, getWorkbenchPath } from "@/lib/auth/permissions";
import { isLeadSpecialist, isReportOperator, reportManagementScope } from "@/lib/auth/live-report-permissions";
import { prisma } from "@/lib/db";
import { ManagementShell } from "@/components/management-shell";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import { LogoutButton } from "@/components/logout-button";
export default async function LeadLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  if (!isLeadSpecialist(user) && !isReportOperator(user) && !isAccountBoss(user) && !await prisma.branch.findFirst({ where: reportManagementScope(user), select: { id: true } })) notFound();
  if (isAccountBoss(user)) return <ManagementShell name={user.name}>{children}</ManagementShell>;
  return <div className="min-h-screen bg-slate-50"><header className="flex h-16 items-center justify-between border-b bg-white px-6"><Link href="/leads" className="font-semibold">星熠传媒 · 导粉工作台</Link><div className="flex items-center gap-4 text-sm"><span>{user.name}</span><LogoutButton /></div></header><div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)]"><aside className="border-r bg-white p-4"><nav className="flex gap-3 lg:flex-col">{isLeadSpecialist(user) && <Link className="rounded-lg p-3 hover:bg-slate-100" href="/leads?view=available">可认领场次</Link>}<Link className="rounded-lg p-3 hover:bg-slate-100" href="/leads">{"已认领待完成"}</Link><Link className="rounded-lg p-3 hover:bg-slate-100" href="/leads?view=completed">已完成场次</Link><Link className="rounded-lg p-3 text-xs text-slate-500 hover:bg-slate-100 lg:mt-4 lg:border-t" href="/leads?view=trash" aria-label="回收站（次要入口）">回收站</Link>{!isLeadSpecialist(user) && <Link className="rounded-lg p-3" href={getWorkbenchPath(user)}>返回工作台</Link>}</nav></aside><main className="min-w-0 space-y-6 p-4 lg:p-8">{children}</main></div></div>;
}
