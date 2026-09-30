import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { hasRole, userRoles } from "@/lib/auth/roles";
import { Role } from "@/app/generated/prisma/enums";
export async function WorkspaceSwitcher() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return null;
  const links = [
    ...(hasRole(user, Role.BOSS) ? [["/boss", "老板工作台"]] : []),
    ...(hasRole(user, Role.CONTROLLER) ? [["/controller", "直播中控工作台"]] : []),
    ...(hasRole(user, Role.LEAD_SPECIALIST) ? [["/leads", "导粉工作台"]] : []),
    ...(userRoles(user).some(role => !([Role.BOSS, Role.CONTROLLER, Role.LEAD_SPECIALIST] as Role[]).includes(role)) ? [["/wip", "其他岗位工作台"]] : []),
  ];
  if (links.length < 2) return null;
  return <nav aria-label="工作台切换" className="flex flex-wrap items-center gap-3 border-b bg-emerald-50 px-6 py-2 text-sm"><span className="text-slate-500">切换工作台</span>{links.map(([href, label]) => <Link key={href} href={href} className="rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-emerald-900 hover:bg-emerald-100">{label}</Link>)}</nav>;
}
