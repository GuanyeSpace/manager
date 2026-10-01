import { z } from "zod";

export function parseDuration(text: string): number | null {
  const value = text.replace(/\s/g, "");
  const match = /^(?:(\d+)小时)?(?:(\d+)分钟)?(?:(\d+)秒)?$/.exec(value);
  if (!match || !value) return null;
  const h = Number(match[1] ?? 0), m = Number(match[2] ?? 0), s = Number(match[3] ?? 0);
  if (h > 999 || m > 59 || s > 59) return null;
  const seconds = h * 3600 + m * 60 + s;
  return seconds > 0 ? seconds : null;
}
export function durationFromParts(value: Record<string, unknown>): string {
  const parts = ["durationHours", "durationMinutes", "durationSeconds"].map(k => String(value[k] ?? ""));
  if (parts.every(p => p === "")) return "";
  return `${parts[0] || "0"}小时${parts[1] || "0"}分钟${parts[2] || "0"}秒`;
}
export const audienceFields = [["femalePercent", "女性比例"], ["age31To40Percent", "31–40岁比例"]] as const;
export const audienceInput = z.string().trim().transform(s => s.replace(/%$/, "").trim()).refine(s => s === "" || /^\d+(\.\d{1,2})?$/.test(s) && Number(s) <= 100, "画像比例须为0至100，最多两位小数").default("");
export const audienceHundredths = (value: string) => value === "" ? null : Math.round(Number(value) * 100);
export const audienceText = (value: number | null) => value === null ? "历史未记录" : `${(value / 100).toFixed(2)}%`;
export const powderFields = [["fanGroupCount", "进粉丝群人数"], ["linkClickCount", "链接点击人数"], ["backendJoinCount", "后端加人数"], ["effectiveCount", "后端有效人数"]] as const;
export const trafficRatios = [["进房率", "entryCount", "exposureCount"]] as const;
export const interactionRatios = [["粉丝转化率", "newFollowers", "entryCount"]] as const;
export const powderRatios = [["场观进群率", "fanGroupCount", "entryCount"], ["链接点击率", "linkClickCount", "fanGroupCount"], ["后端加人率", "backendJoinCount", "fanGroupCount"], ["后端有效率", "effectiveCount", "backendJoinCount"], ["场观加人率", "backendJoinCount", "entryCount"], ["点击加人率", "backendJoinCount", "linkClickCount"]] as const;
