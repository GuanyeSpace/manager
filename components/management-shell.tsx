"use client";
import Link from "next/link";
import { NavigationTrail } from "@/components/context-link";
import { usePathname, useSearchParams } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
const groups = [
  { title: "业务管理", items: [["/boss", "管理概览"], ["/account-config", "抖音账号配置"], ["/accounts", "抖音账号管理"], ["/live-reports", "直播数据"], ["/live-reports?view=monetization", "打粉数据"], ["/leads", "导粉场次与数据"], ["/workbench/history", "场次执行记录"], ["/workbench/shifts", "上班与设备检查"]] },
  { title: "人员与直播间", items: [["/resources/anchors", "主播管理"], ["/resources/rooms", "直播间管理"], ["/boss/users", "员工管理"], ["/boss/branches", "分公司管理"]] },
  { title: "物资管理", items: [["/resources/numbers", "手机号管理"], ["/resources/phones", "手机管理"], ["/resources/equipment", "设备管理"], ["/resources/materials", "物资管理"]] },
];
export function ManagementShell({ name, children }: { name: string; children: React.ReactNode }) {
  const path = usePathname();
  const searchParams = useSearchParams();
  const active = (href: string) => {
    if (href.startsWith("/live-reports")) return (path === "/live-reports" || path.startsWith("/live-reports/")) && (searchParams.get("view") === "monetization") === href.includes("view=monetization");
    return href === "/boss" ? path === href : path === href || path.startsWith(`${href}/`);
  };
  const current = groups.flatMap(g => g.items).find(([href]) => active(href))?.[1] ?? "直播工作台";
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-white px-4 lg:px-6"><Link href="/boss" className="shrink-0 font-semibold tracking-wide">星熠传媒 <span className="ml-2 hidden text-xs font-normal text-slate-400 sm:inline">业务管理系统</span></Link><nav aria-label="顶部导航" className="flex items-center gap-5 text-sm"><Link href="/boss" className="hidden sm:block">管理中心</Link><Link href="/workbench" className="hidden sm:block">直播中控工作台</Link><span className="border-l pl-5 text-slate-500">{name}</span><LogoutButton /></nav></header>
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)]"><aside className="border-b bg-white p-4 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto lg:border-r"><nav aria-label="管理菜单" className="flex gap-6 overflow-x-auto lg:block lg:space-y-6">{groups.map(group => <section key={group.title} className="shrink-0"><p className="mb-2 px-3 text-xs font-medium text-slate-400">{group.title}</p><div className="flex gap-1 lg:block lg:space-y-1">{group.items.map(([href, title]) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={`block rounded-lg px-3 py-2.5 text-sm transition-colors ${active(href) ? "bg-slate-900 font-medium text-white" : "text-slate-600 hover:bg-slate-100"}`}>{title}</Link>)}</div></section>)}</nav></aside><div className="min-w-0 p-4 lg:p-8"><p className="mb-5 text-xs text-slate-400">管理中心 / {current}</p><NavigationTrail /><div className="min-w-0 space-y-6 rounded-2xl border bg-white p-4 shadow-sm lg:p-6">{children}</div></div></div>
  </div>;
}
