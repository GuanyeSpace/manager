// 管理侧栏的菜单模型与唯一选中判断。
// 纯数据 + 纯函数：不依赖 React，便于独立验证；权限判断不在这里，前端隐藏也不算授权。
export type MenuItem = { href: string; label: string };
export type MenuGroup = { title: string; items: MenuItem[] };

// 总览单独置顶，不放进任何分组。
export const TOP_ITEM: MenuItem = { href: "/boss", label: "工作台" };

export const MENU_GROUPS: MenuGroup[] = [
  { title: "直播业务", items: [
    { href: "/accounts", label: "抖音账号" },
    { href: "/account-config", label: "账号流程与话术" },
    { href: "/resources/rooms", label: "直播间" },
    { href: "/workbench/history", label: "场次执行记录" },
    { href: "/workbench/shifts", label: "上班检查记录" },
  ] },
  { title: "数据统计", items: [
    { href: "/live-reports", label: "直播数据" },
    { href: "/live-reports?view=monetization", label: "打粉数据" },
    { href: "/leads", label: "导粉任务" },
  ] },
  { title: "设备与物资", items: [
    { href: "/resources/phones", label: "手机" },
    { href: "/resources/numbers", label: "手机号" },
    { href: "/resources/equipment", label: "电脑与设备" },
    { href: "/resources/materials", label: "办公物资" },
  ] },
  { title: "组织人员", items: [
    { href: "/boss/users", label: "员工" },
    { href: "/resources/anchors", label: "主播" },
    { href: "/boss/branches", label: "分公司" },
  ] },
];

export const MENU_ITEMS: MenuItem[] = [TOP_ITEM, ...MENU_GROUPS.flatMap(group => group.items)];

// 唯一选中语义（自 09-30 打粉视图沿用，未改）：
// - 直播与打粉共用 /live-reports，用 view=monetization 区分，且包含 /live-reports/[id] 详情；
// - /boss 只精确匹配，详情路由不得把工作台首页点亮；
// - 其余按前缀匹配所属模块的详情页。
export function isMenuActive(href: string, pathname: string, view: string | null): boolean {
  if (href.startsWith("/live-reports")) {
    const inReports = pathname === "/live-reports" || pathname.startsWith("/live-reports/");
    return inReports && (view === "monetization") === href.includes("view=monetization");
  }
  if (href === "/boss") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

// 未列入菜单的工作台路由：给出准确的当前位置，且绝不误选工作台首页。
const FALLBACK_LOCATIONS: [string, string][] = [
  ["/workbench", "直播工作台"],
  ["/wip", "其他岗位工作台"],
  ["/controller", "直播中控工作台"],
];

// 顶部位置导航文案；group 为 null 表示该路由不属于任何菜单分组。
export function currentLocation(pathname: string, view: string | null): { group: string | null; label: string } {
  if (isMenuActive(TOP_ITEM.href, pathname, view)) return { group: null, label: TOP_ITEM.label };
  for (const group of MENU_GROUPS) {
    const hit = group.items.find(item => isMenuActive(item.href, pathname, view));
    if (hit) return { group: group.title, label: hit.label };
  }
  const fallback = FALLBACK_LOCATIONS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return { group: null, label: fallback ? fallback[1] : "管理系统" };
}

// 当前项所在分组；用于路由切换时强制展开该组。
export function activeGroupTitle(pathname: string, view: string | null): string | null {
  return currentLocation(pathname, view).group;
}
