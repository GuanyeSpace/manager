// 管理侧栏唯一选中与位置文案的针对性验证。
// 运行：./node_modules/.bin/tsx --test lib/navigation-menu.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { MENU_GROUPS, MENU_ITEMS, TOP_ITEM, currentLocation, isMenuActive } from "./navigation-menu";

// 任务确认的 20 个入口（置顶 1 项 + 5 组 19 项），配置入口按 D060 分组。
const expectedEntries: [string, string][] = [
  ["/boss", "工作台"],
  ["/accounts", "抖音账号"],
  ["/resources/rooms", "直播间"],
  ["/workbench/history", "场次执行记录"],
  ["/workbench/shifts", "上班检查记录"],
  ["/live-reports", "直播数据"],
  ["/live-reports?view=monetization", "打粉数据"],
  ["/leads", "导粉任务"],
  ["/settlements", "确定打粉数据"],
  ["/settlements/comparison", "每日数据对比"],
  ["/resources/phones", "手机"],
  ["/resources/numbers", "手机号"],
  ["/resources/equipment", "电脑与设备"],
  ["/resources/materials", "办公物资"],
  ["/boss/users", "员工"],
  ["/resources/anchors", "主播"],
  ["/boss/branches", "分公司"],
  ["/account-config", "账号流程与话术"],
  ["/boss/reporting", "直播数据填写设置"],
  ["/settlements/backends", "后端资料"],
];

function splitHref(href: string): { pathname: string; view: string | null } {
  const [pathname, search = ""] = href.split("?");
  return { pathname, view: new URLSearchParams(search).get("view") };
}

function activeHrefs(pathname: string, view: string | null): string[] {
  return MENU_ITEMS.filter(item => isMenuActive(item.href, pathname, view)).map(item => item.href);
}

test("菜单就是确认的 20 个入口，展示名与路由没有漂移", () => {
  assert.equal(MENU_ITEMS.length, 20);
  assert.deepEqual(MENU_ITEMS.map(item => [item.href, item.label]), expectedEntries);
  assert.deepEqual(MENU_GROUPS.map(group => group.title), ["直播业务", "数据统计", "设备与物资", "组织人员", "配置管理"]);
  assert.deepEqual(MENU_GROUPS.map(group => group.items.length), [4, 5, 4, 3, 3]);
  assert.equal(TOP_ITEM.href, "/boss");
});

test("每个菜单入口在自己的路由下唯一选中", () => {
  for (const [href] of expectedEntries) {
    const { pathname, view } = splitHref(href);
    assert.deepEqual(activeHrefs(pathname, view), [href], href);
  }
});

// [pathname, view, 期望选中的 href]
const cases: [string, string | null, string][] = [
  ["/boss", null, "/boss"],
  ["/boss/users", null, "/boss/users"],
  ["/boss/users/new", null, "/boss/users"],
  ["/boss/users/u1", null, "/boss/users"],
  ["/boss/branches", null, "/boss/branches"],
  ["/accounts", null, "/accounts"],
  ["/accounts/new", null, "/accounts"],
  ["/accounts/a1", null, "/accounts"],
  ["/accounts/history", null, "/accounts"],
  ["/account-config", null, "/account-config"],
  ["/account-config/c1", null, "/account-config"],
  ["/resources/rooms", null, "/resources/rooms"],
  ["/resources/rooms/r1", null, "/resources/rooms"],
  ["/resources/anchors", null, "/resources/anchors"],
  ["/resources/numbers", null, "/resources/numbers"],
  ["/resources/numbers/n1", null, "/resources/numbers"],
  ["/resources/phones", null, "/resources/phones"],
  ["/resources/phones/p1", null, "/resources/phones"],
  ["/resources/equipment", null, "/resources/equipment"],
  ["/resources/equipment/e1", null, "/resources/equipment"],
  ["/resources/materials", null, "/resources/materials"],
  ["/workbench/history", null, "/workbench/history"],
  ["/workbench/shifts", null, "/workbench/shifts"],
  ["/live-reports", null, "/live-reports"],
  ["/live-reports/new", null, "/live-reports"],
  ["/live-reports/r1", null, "/live-reports"],
  ["/live-reports", "monetization", "/live-reports?view=monetization"],
  ["/live-reports/r1", "monetization", "/live-reports?view=monetization"],
  ["/settlements/backends", null, "/settlements/backends"],
  ["/settlements/backends/b1", null, "/settlements/backends"],
  ["/settlements/comparison", null, "/settlements/comparison"],
  ["/settlements/s1", null, "/settlements"],
  ["/boss/reporting", null, "/boss/reporting"],
  ["/leads", null, "/leads"],
  ["/leads/l1", null, "/leads"],
];

test("详情与筛选路由命中所属模块，且始终只有一个选中项", () => {
  for (const [pathname, view, expected] of cases) {
    assert.deepEqual(activeHrefs(pathname, view), [expected], `${pathname}?view=${view}`);
  }
});

test("直播与打粉互斥，打粉详情保留打粉选中", () => {
  assert.deepEqual(activeHrefs("/live-reports", null), ["/live-reports"]);
  assert.deepEqual(activeHrefs("/live-reports", "performance"), ["/live-reports"]);
  assert.deepEqual(activeHrefs("/live-reports", "monetization"), ["/live-reports?view=monetization"]);
  assert.deepEqual(activeHrefs("/live-reports/r1", "monetization"), ["/live-reports?view=monetization"]);
});

test("工作台首页不会被详情路由误选中，未匹配路由给出准确位置", () => {
  for (const pathname of ["/workbench", "/workbench/accounts/a1", "/workbench/sessions/s1", "/wip", "/controller"]) {
    assert.deepEqual(activeHrefs(pathname, null), [], pathname);
    assert.notEqual(currentLocation(pathname, null).label, TOP_ITEM.label, pathname);
  }
  assert.deepEqual(currentLocation("/workbench", null), { group: null, label: "直播工作台" });
  assert.deepEqual(currentLocation("/workbench/sessions/s1", null), { group: null, label: "直播工作台" });
  assert.deepEqual(currentLocation("/wip", null), { group: null, label: "其他岗位工作台" });
  assert.deepEqual(currentLocation("/controller", null), { group: null, label: "直播中控工作台" });
});

test("位置文案带所在分组，未匹配时不臆造分组", () => {
  assert.deepEqual(currentLocation("/boss", null), { group: null, label: "工作台" });
  assert.deepEqual(currentLocation("/accounts/history", null), { group: "直播业务", label: "抖音账号" });
  assert.deepEqual(currentLocation("/live-reports/r1", "monetization"), { group: "数据统计", label: "打粉数据" });
  assert.deepEqual(currentLocation("/resources/numbers/n1", null), { group: "设备与物资", label: "手机号" });
  assert.deepEqual(currentLocation("/boss/users/new", null), { group: "组织人员", label: "员工" });
  for (const [path, label] of [["/account-config/c1", "账号流程与话术"], ["/boss/reporting", "直播数据填写设置"], ["/settlements/backends", "后端资料"]]) assert.deepEqual(currentLocation(path, null), {group:"配置管理",label});
  assert.deepEqual(currentLocation("/unknown-page", null), { group: null, label: "管理系统" });
});

test("/account-config 与 /accounts 不互相误匹配", () => {
  assert.deepEqual(activeHrefs("/account-config", null), ["/account-config"]);
  assert.deepEqual(activeHrefs("/accounts", null), ["/accounts"]);
  assert.deepEqual(activeHrefs("/account-config/c1", null), ["/account-config"]);
});
