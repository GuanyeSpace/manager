import "server-only";
import { hasRole, userRoles } from "@/lib/auth/roles";
import { Role } from "@/app/generated/prisma/enums";

export type WorkspaceLink = { href: string; label: string };

// 工作台切换的唯一权限来源：只列出当前岗位组合可以进入的工作台。
// 顶栏切换菜单与全局 WorkspaceSwitcher 共用本函数，避免两处岗位判断漂移或放宽。
export function workspaceLinks(user: { role: Role; roles?: Role[] }): WorkspaceLink[] {
  return [
    ...(hasRole(user, Role.BOSS) ? [{ href: "/boss", label: "老板工作台" }] : []),
    ...(hasRole(user, Role.CONTROLLER) ? [{ href: "/controller", label: "直播中控工作台" }] : []),
    ...(hasRole(user, Role.LEAD_SPECIALIST) ? [{ href: "/leads", label: "导粉工作台" }] : []),
    ...(hasRole(user, Role.ANCHOR) ? [{ href: "/anchor", label: "主播工作台" }] : []),
    ...(userRoles(user).some(role => !([Role.BOSS, Role.CONTROLLER, Role.LEAD_SPECIALIST, Role.ANCHOR] as Role[]).includes(role))
      ? [{ href: "/wip", label: "其他岗位工作台" }]
      : []),
  ];
}
