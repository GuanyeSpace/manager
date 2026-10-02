"use client";
import Link from "next/link";
import { previewRoute } from "@/lib/auth/preview-path";
import { usePathname, useSearchParams } from "next/navigation";
import { followHref, parseTrail, trailLabel, withTrail } from "@/lib/navigation-trail";
import type { ComponentProps } from "react";

export default function ContextLink({ href, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname(), path = previewRoute(pathname)?.path ?? pathname, search = useSearchParams();
  // 查询分页及同模块导航维持原语义；资料详情、账号数据和新增入口记录来路。
  const trail = parseTrail(search.get("via"));
  const destination = typeof href !== "string" ? href : href.startsWith("?") ? withTrail(path + href, trail)
    : href.split(/[?#]/)[0] === path ? withTrail(href, trail)
    : /^\/(resources\/[^/]+\/|accounts\/[^?]|account-config\/|boss\/users\/|leads\/|settlements\/|live-reports(?:\/|\?accountId)|workbench\/(accounts|sessions|shifts|history)\/)/.test(href)
      ? followHref(href, `${path}?${search}`) : href;
  return <Link href={destination} {...props} />;
}
export function NavigationFields() {
  const search = useSearchParams();
  return <input type="hidden" name="via" value={JSON.stringify(parseTrail(search.get("via")))} />;
}
export function ReturnLink({ fallback, label }: { fallback: string; label: string }) {
  const search = useSearchParams(), trail = parseTrail(search.get("via"));
  const previous = trail.at(-1);
  return <Link className="text-sm text-muted-foreground hover:underline" href={previous ? withTrail(previous, trail.slice(0, -1)) : fallback}>← {previous ? `返回${trailLabel(previous)}` : label}</Link>;
}
export function NavigationTrail() {
  const search = useSearchParams(), trail = parseTrail(search.get("via"));
  if (!trail.length) return null;
  return <nav aria-label="查看路径" className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>查看路径：</span>{trail.map((path, index) => <span key={index} className="flex items-center gap-2"><Link className="underline" href={withTrail(path, trail.slice(0, index))}>{trailLabel(path)}</Link><span>›</span></span>)}<span>当前资料</span></nav>;
}
