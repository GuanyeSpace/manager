// 仅保存站内管理路径；来源只影响导航，不参与权限判断。
const origin = "https://manager.invalid";
function localUrl(value: string): URL | null {
  if (value.length > 24000 || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x1f]/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    return url.origin === origin && /^\/(boss|resources|accounts|account-config|live-reports|leads|workbench|controller|settlements|anchor|wip)(\/|$)/.test(url.pathname) ? url : null;
  } catch { return null; }
}
function relative(url: URL) { return url.pathname + url.search + url.hash; }
export function parseTrail(value: unknown): string[] {
  if (typeof value !== "string" || value.length > 16000) return [];
  try {
    const paths: unknown = JSON.parse(value);
    if (!Array.isArray(paths) || paths.length > 10) return [];
    return paths.flatMap(path => {
      const url = typeof path === "string" && path.length <= 3000 ? localUrl(path) : null;
      if (!url) return [];
      url.searchParams.delete("via"); return [relative(url)];
    });
  } catch { return []; }
}
export function withTrail(href: string, trail: string[]) {
  const url = localUrl(href); if (!url) return href;
  url.searchParams.delete("via");
  const safe = parseTrail(JSON.stringify(trail));
  if (safe.length) url.searchParams.set("via", JSON.stringify(safe));
  return relative(url);
}
export function followHref(href: string, current: string) {
  const destination = localUrl(href), source = localUrl(current);
  if (!destination || !source) return href;
  const trail = parseTrail(source.searchParams.get("via"));
  source.searchParams.delete("via");
  if (destination.pathname === source.pathname) return withTrail(href, trail);
  // 循环查看同一份资料时退回已有层级，防止来源链不断增长。
  const previous = trail.findIndex(path => localUrl(path)?.pathname === destination.pathname);
  return withTrail(href, previous >= 0 ? trail.slice(0, previous) : [...trail, relative(source)].slice(-10));
}
export function trailLabel(path: string) {
  const url = localUrl(path);
  const pathname = url?.pathname ?? "";
  if (pathname === "/live-reports" && url?.searchParams.get("view") === "monetization") return "打粉数据";
  const names: [string, string][] = [["/settlements/comparison", "每日数据对比"], ["/settlements/backends", "后端资料"], ["/settlements", "确定打粉数据"], ["/anchor", "主播工作台"], ["/resources/numbers", "手机号管理"], ["/resources/phones", "手机管理"], ["/resources/rooms", "直播间管理"], ["/resources/anchors", "主播管理"], ["/resources/equipment", "设备管理"], ["/resources/materials", "物资管理"], ["/boss/users", "员工管理"], ["/boss/branches", "分公司管理"], ["/account-config", "账号配置"], ["/accounts", "抖音账号管理"], ["/live-reports", "直播数据"], ["/leads", "导粉场次"], ["/workbench/history", "场次记录"], ["/workbench/shifts", "上班检查记录"], ["/workbench", "直播工作台"], ["/boss", "管理概览"]];
  const match = names.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"));
  return match ? match[1] + (pathname !== match[0] ? "详情" : "") : "上一页";
}
