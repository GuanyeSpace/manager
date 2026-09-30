"use client";
import { useState } from "react";
import { shanghaiInput } from "@/modules/live-reports/schema";
export function WorkTimeInput({ initial, label }: { initial: string; label: string }) {
  const [value, setValue] = useState(initial);
  return <div className="space-y-2"><label className="block space-y-2 text-sm"><span>{label}</span><input type="datetime-local" name="time" required value={value} onChange={event => setValue(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" /></label><button type="button" onClick={() => setValue(shanghaiInput(new Date()))} className="text-xs underline">填入当前北京时间</button><p className="text-xs text-muted-foreground">页面停留期间不会自动更新时间，提交前请核对实际时间。</p></div>;
}
