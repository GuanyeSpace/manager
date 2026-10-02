import { shanghaiInput, shanghaiDate } from "./schema";
export const datePresets = [["yesterday", "昨日"], ["7d", "近7天"], ["30d", "近30天"], ["month", "本月"], ["lastMonth", "上月"]] as const;
export function dateRange(preset: string, now = new Date()) {
  const today = shanghaiInput(now).slice(0,10), start = shanghaiDate(today + "T00:00")!;
  const day = (offset: number) => shanghaiInput(new Date(+start + offset * 86400000)).slice(0,10);
  const yesterday = day(-1);
  if (preset === "yesterday") return { from: yesterday, to: yesterday };
  if (preset === "7d" || preset === "30d") return { from: day(preset === "7d" ? -7 : -30), to: yesterday };
  if (preset === "month") return { from: today.slice(0,7)+"-01", to: yesterday };
  if (preset === "lastMonth") { const end = shanghaiInput(new Date(+shanghaiDate(today.slice(0,7)+"-01T00:00")! - 86400000)).slice(0,10); return { from: end.slice(0,7)+"-01", to: end }; }
  return null;
}
