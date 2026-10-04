"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
const StageNavigation = createContext<((id: string) => void) | null>(null);
export function WorkDataStep({ disabled, submitted }: { disabled: boolean; submitted: boolean }) {
  const select = useContext(StageNavigation);
  return <button type="button" disabled={disabled || !select} onClick={() => select?.("data")} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{submitted ? "查看直播数据与收尾" : "下一步：填写直播数据"}</button>;
}
export function WorkStageTabs({ initial, items }: { initial: string; items: { id: string; label: string; content: ReactNode }[] }) {
  const [selected, setSelected] = useState(initial);
  return <StageNavigation.Provider value={setSelected}><section className="min-w-0 space-y-4"><div className={`grid ${items.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"} rounded-xl border bg-muted/30 p-1`} role="tablist" aria-label="直播阶段">{items.map((item, i) => <button key={item.id} type="button" id={`tab-${item.id}`} role="tab" aria-selected={selected === item.id} aria-controls={`panel-${item.id}`} onClick={() => setSelected(item.id)} className={`min-w-0 rounded-lg px-2 py-3 text-sm ${selected === item.id ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{i + 1}　{item.label}{item.id === initial && <span className="ml-1 text-xs">· 当前</span>}</button>)}</div>{items.map(item => <div key={item.id} role="tabpanel" id={`panel-${item.id}`} aria-labelledby={`tab-${item.id}`} hidden={selected !== item.id}>{item.content}</div>)}</section></StageNavigation.Provider>;
}
