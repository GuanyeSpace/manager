"use client";
import { audienceFields, powderFields, trafficRatios, interactionRatios, powderRatios } from "@/modules/live-reports/input-metrics";
import { metricFields, percentage } from "@/modules/live-reports/schema";
const inputClass = "w-full rounded-lg border bg-white px-3 py-2 text-sm";
export function ReportMetricSections({ values, onChange, disabled = false, completed = false, powder = false, live = true }: { values: Record<string,string>; onChange: (key: string, value: string) => void; disabled?: boolean; completed?: boolean; powder?: boolean; live?: boolean }) {
  const input = (key: string, label: string) => {
    const text = key === "durationText" || key.endsWith("Percent");
    return <label key={key} className="block space-y-1 text-sm"><span>{label}</span><input name={key} aria-label={label} type={text ? "text" : "number"} min={text ? undefined : 0} step={key === "averageStayMinutes" ? "0.01" : text ? undefined : "1"} disabled={disabled} className={inputClass} value={values[key] ?? ""} placeholder={key === "durationText" ? "如：1小时1分钟18秒" : key.endsWith("Percent") ? completed ? "历史未记录" : "如：65.32%" : "待补填"} onChange={e => onChange(key,e.target.value)} /></label>;
  };
  const ratio = ([label,n,d]: readonly [string,string,string]) => <div key={label} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="text-slate-500">{label}（自动）</p><output className="mt-1 block font-semibold">{values[n] === "" || values[d] === "" || values[n] === undefined || values[d] === undefined ? "—" : percentage(Number(values[n]),Number(values[d]))}</output></div>;
  const group = (title: string, children: React.ReactNode) => <section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="font-semibold">{title}</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div></section>;
  return <>{live && <>{group("基本信息",input("durationText","直播时长"))}{group("流量指标",<>{metricFields.slice(0,2).map(([k,l])=>input(k,l))}{trafficRatios.map(ratio)}{metricFields.slice(2,4).map(([k,l])=>input(k,l))}</>)}{group("互动指标",<>{input("averageStayMinutes","人均停留时长（分钟）")}{metricFields.slice(4).map(([k,l])=>input(k,l))}{interactionRatios.map(ratio)}</>)}{group("观众画像",audienceFields.map(([k,l])=>input(k,l)))}</>}{powder && group("打粉数据",<><div className="text-sm"><p>进房人数（引用本场直播数据）</p><output className="mt-2 block font-semibold">{values.entryCount || "待填写直播数据"}</output></div>{powderFields.map(([k,l])=>input(k,l))}{powderRatios.map(ratio)}</>)}</>;
}
export function HistoricalReportFields({ data }: { data: { longPressCount?: unknown; hasSales?: unknown; salesGmv?: unknown } }) {
  const present = (v: unknown) => v !== undefined && v !== null && v !== "";
  if (![data.longPressCount,data.hasSales,data.salesGmv].some(present)) return null;
  return <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer">历史字段（只读保留）</summary><div className="mt-3 space-y-2">{present(data.longPressCount) && <p>长按人数：{String(data.longPressCount)}</p>}{present(data.hasSales) && <p>带货状态：{data.hasSales ? "已统计带货" : "没带货"}</p>}{present(data.salesGmv) && <p>带货GMV：{String(data.salesGmv)}</p>}</div></details>;
}
