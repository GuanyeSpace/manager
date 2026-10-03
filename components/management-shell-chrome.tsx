"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { Dialog as DialogPrimitive, DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { NavigationTrail } from "@/components/context-link";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { activeGroupTitle, currentLocation, isMenuActive, MENU_GROUPS, TOP_ITEM, type MenuItem } from "@/lib/navigation-menu";
import {
  AlarmClock, Building2, ChartColumn, ChevronDown, Circle, ClipboardList, Hash, LayoutDashboard,
  ListChecks, Megaphone, Menu as MenuIcon, Monitor, Package, Radio, Send, Smartphone, UserRound, Users, Video, X,
} from "lucide-react";

type WorkspaceLink = { href: string; label: string };

// 菜单图标按展示入口而不是路由前缀取，直播/打粉共用路由但图标不同。
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "/boss": LayoutDashboard,
  "/accounts": Radio,
  "/account-config": ClipboardList,
  "/resources/rooms": Video,
  "/workbench/history": ListChecks,
  "/workbench/shifts": AlarmClock,
  "/live-reports": ChartColumn,
  "/live-reports?view=monetization": Send,
  "/leads": Megaphone,
  "/resources/phones": Smartphone,
  "/resources/numbers": Hash,
  "/resources/equipment": Monitor,
  "/resources/materials": Package,
  "/boss/users": Users,
  "/resources/anchors": UserRound,
  "/boss/branches": Building2,
};

// 顶栏切换工作台：保留现有 /workbench 入口，其余条目与全局 WorkspaceSwitcher 同一权限来源。
const WORKBENCH_PAGE: WorkspaceLink = { href: "/workbench", label: "直播工作台" };

function MenuRow({ item, active, onNavigate }: { item: MenuItem; active: boolean; onNavigate?: () => void }) {
  const Icon = ICONS[item.href] ?? Circle;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-400 ${active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
    >
      <Icon aria-hidden className="size-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function MenuList({ pathname, view, collapsed, onToggle, onNavigate, idPrefix, boss }: {
  pathname: string; view: string | null; collapsed: Record<string, boolean>;
  onToggle: (title: string) => void; onNavigate?: () => void; idPrefix: string; boss: boolean;
}) {
  return (
    <div className="space-y-3">
      <MenuRow item={TOP_ITEM} active={isMenuActive(TOP_ITEM.href, pathname, view)} onNavigate={onNavigate} />
      {MENU_GROUPS.map(group => {
        const open = !collapsed[group.title];
        const panelId = `${idPrefix}-group-${group.title}`;
        return (
          <section key={group.title}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => onToggle(group.title)}
              className="flex h-7 w-full items-center justify-between rounded-md px-3 text-xs font-medium text-slate-400 outline-none hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <span>{group.title}</span>
              <ChevronDown aria-hidden className={`size-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
            </button>
            <div id={panelId} hidden={!open} className="mt-1 space-y-0.5">
                {group.items.filter(item => item.href !== "/boss/reporting" || boss).map(item => (
                  <MenuRow key={item.href} item={item} active={isMenuActive(item.href, pathname, view)} onNavigate={onNavigate} />
                ))}
              </div>
          </section>
        );
      })}
    </div>
  );
}

function WorkspaceMenu({ workspaces }: { workspaces: WorkspaceLink[] }) {
  // 岗位组合里没有可切换对象时仍保留现有 /workbench 入口，不新增也不放宽权限。
  const items = [...workspaces, WORKBENCH_PAGE];
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <Button variant="outline" size="sm" aria-label="切换工作台">
          切换工作台<ChevronDown aria-hidden />
        </Button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content align="end" sideOffset={6} className="z-50 min-w-44 rounded-lg border bg-white p-1 shadow-md">
          {items.map(item => (
            <DropdownMenuPrimitive.Item key={item.href} asChild>
              <Link href={item.href} className="block rounded-md px-3 py-2 text-sm text-slate-700 outline-none select-none data-highlighted:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-400">
                {item.label}
              </Link>
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

// 共享管理布局的展示部分。按当前路由高亮菜单；不做权限判断（由各 layout 与页面的具名能力函数负责）。
export function ManagementShellChrome({ name, workspaces, children }: {
  name: string; workspaces: WorkspaceLink[]; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [mobileOpen, setMobileOpen] = useState(false);
  const navKey = `${pathname}?${searchParams.toString()}`;
  const [previousNavKey, setPreviousNavKey] = useState(navKey);
  const location = currentLocation(pathname, view);
  const activeGroup = activeGroupTitle(pathname, view);

  // 在提交新路由前重置瞬时状态，历史返回不会恢复旧的抽屉打开标记。
  if (previousNavKey !== navKey) {
    setPreviousNavKey(navKey);
    setMobileOpen(false);
    if (activeGroup) setCollapsed(previous => ({ ...previous, [activeGroup]: false }));
  }

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  const toggle = (title: string) => setCollapsed(previous => ({ ...previous, [title]: !previous[title] }));

  return (
    <div data-management-shell className="min-h-screen bg-slate-50 text-slate-900">
      <div className="lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
        <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:bg-white">
          <div className="shrink-0 px-4 py-4">
            <p className="text-sm font-semibold tracking-wide">星熠传媒</p>
            <p className="mt-0.5 text-[11px] text-slate-400">业务管理系统</p>
          </div>
          <nav aria-label="管理菜单" className="flex-1 overflow-y-auto px-2 pb-6">
            <MenuList boss={workspaces.some(w=>w.href === "/boss")} pathname={pathname} view={view} collapsed={collapsed} onToggle={toggle} idPrefix="desktop" />
          </nav>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 lg:px-6">
            <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
              <DialogPrimitive.Trigger asChild>
                <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="打开管理菜单">
                  <MenuIcon aria-hidden />
                </Button>
              </DialogPrimitive.Trigger>
              <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 lg:hidden" />
                <DialogPrimitive.Content
                  aria-describedby={undefined}
                  className="fixed inset-y-0 left-0 z-50 flex w-[264px] max-w-[85vw] flex-col overflow-y-auto bg-white p-4 lg:hidden"
                >
                  <div className="mb-3 flex shrink-0 items-center justify-between">
                    <DialogPrimitive.Title className="text-sm font-semibold">管理菜单</DialogPrimitive.Title>
                    <DialogPrimitive.Close asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="关闭管理菜单"><X aria-hidden /></Button>
                    </DialogPrimitive.Close>
                  </div>
                  <MenuList boss={workspaces.some(w=>w.href === "/boss")} pathname={pathname} view={view} collapsed={collapsed} onToggle={toggle} onNavigate={() => setMobileOpen(false)} idPrefix="mobile" />
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            </DialogPrimitive.Root>

            <nav aria-label="当前位置" className="min-w-0 flex-1 truncate text-sm">
              {location.group && <span className="text-slate-400">{location.group} / </span>}
              <span className="font-medium text-slate-700">{location.label}</span>
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              <WorkspaceMenu workspaces={workspaces} />
              <span className="hidden max-w-32 truncate text-sm text-slate-500 sm:inline">{name}</span>
              <LogoutButton />
            </div>
          </header>

          <main className="min-w-0 flex-1 p-4 lg:p-6">
            <NavigationTrail />
            <div className="min-w-0 space-y-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
