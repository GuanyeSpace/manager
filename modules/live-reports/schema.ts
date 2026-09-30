import { z } from "zod";

// datetime-local 始终按上海时间解释，不依赖浏览器或服务器时区。
export function shanghaiDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 16) === value ? date : null;
}
export function shanghaiInput(date: Date): string {
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 16);
}
const integer = (max = 2_000_000_000) => z.string().regex(/^\d+$/, "请输入非负整数").refine((v) => Number(v) <= max, "数值超出范围");
export const metricFields = [
  ["exposureCount", "曝光人数"], ["entryCount", "进房人数"],
  ["averageOnline", "平均在线"], ["peakOnline", "最高在线"],
  ["commenterCount", "评论人数"], ["likeCount", "点赞次数"],
  ["newFollowers", "新增粉丝"], ["shareCount", "分享次数"],
  ["newFanClubMembers", "本场新增粉丝团人数"],
] as const;
export const reportSchema = z.object({
  reason: z.string().trim().max(2000).default(""),
  workSessionId: z.string().max(100).optional(),
  id: z.string(), version: integer(), accountId: z.string().min(1, "请选择账号"),
  startedAt: z.string().refine((v) => shanghaiDate(v) !== null, "请输入有效的开播时间"),
  durationHours: integer(999), durationMinutes: integer(59), durationSeconds: integer(59),
  sessionLabel: z.string().trim().min(1, "请输入场次，例如晚上场").max(30, "场次名称最多 30 字"),
  exposureCount: integer(), entryCount: integer(), averageOnline: integer(), peakOnline: integer(),
  averageStayMinutes: z.string().regex(/^\d+(\.\d{1,2})?$/, "请输入分钟数，最多两位小数").refine((v) => Number(v) <= 59940, "停留时长超出范围"),
  commenterCount: integer(), likeCount: integer(), newFollowers: integer(), shareCount: integer(), newFanClubMembers: integer(),
  confirmBackfill: z.enum(["true", "false"]).default("false"),
}).superRefine((v, ctx) => {
  const seconds = Number(v.durationHours) * 3600 + Number(v.durationMinutes) * 60 + Number(v.durationSeconds);
  if (!seconds) ctx.addIssue({ code: "custom", path: ["durationSeconds"], message: "直播时长必须大于 0" });
  if (Number(v.averageOnline) > Number(v.peakOnline)) ctx.addIssue({ code: "custom", path: ["averageOnline"], message: "平均在线不能大于最高在线" });
});
export type ReportInput = Omit<z.infer<typeof reportSchema>, "reason"> & { reason?: string };
export type ReportFormState = { success?: string; error?: string; fieldErrors?: Record<string, string[] | undefined> } | undefined;

const dateFilter = z.string().refine((v) => !v || shanghaiDate(`${v}T00:00`) !== null, "日期无效");
export const reportFilterSchema = z.object({
  trash: z.enum(["true", "false"]).optional(), view: z.enum(["performance", "monetization"]).optional(),
  accountId: z.string().default(""), from: dateFilter.default(""), to: dateFilter.default(""),
  page: z.coerce.number().int().min(1).max(100000).catch(1),
}).refine((v) => !v.from || !v.to || v.from <= v.to, { message: "开始日期不能晚于结束日期", path: ["from"] });
export type ReportFilters = z.infer<typeof reportFilterSchema>;

export function percentage(numerator: number, denominator: number): string {
  return denominator > 0 ? `${(numerator / denominator * 100).toFixed(2)}%` : "—";
}
export function durationText(seconds: number): string {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return `${hours ? `${hours}小时` : ""}${minutes}分钟${seconds % 60}秒`;
}
