import Link from "next/link";
import { datePresets } from "@/modules/live-reports/date-range";
export function DateShortcuts({ path, params }: { path: string; params: Record<string,string> }) {
  return <nav aria-label="快捷日期" className="flex flex-wrap gap-3 text-sm">{datePresets.map(([preset,label]) => <Link key={preset} className="rounded border bg-white px-3 py-1 hover:bg-slate-100" href={`${path}?${new URLSearchParams({...params,preset,page:"1"})}`}>{label}</Link>)}</nav>;
}
