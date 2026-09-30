import { z } from "zod";
import { metricFields } from "@/modules/live-reports/schema";
import { monetizationFields } from "@/modules/live-reports/monetization-schema";

export const leadFields = [["durationHours", "直播时长（小时）"], ["durationMinutes", "直播时长（分钟）"], ["durationSeconds", "直播时长（秒）"], ...metricFields, ["averageStayMinutes", "人均停留（分钟）"], ...monetizationFields] as const;
export type LeadValues = Record<typeof leadFields[number][0], string>;
export function leadValues(data: unknown): LeadValues {
  const value = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return Object.fromEntries(leadFields.map(([key]) => [key, typeof value[key] === "string" ? value[key] : ""])) as LeadValues;
}
const count = z.string().regex(/^\d*$/, "请输入非负整数").refine(v => Number(v) <= 2_000_000_000, "数值超出范围");
const fields = Object.fromEntries(leadFields.map(([key]) => [key, count.default("")])) as unknown as Record<keyof LeadValues, z.ZodType<string>>;
export const leadDataSchema = z.object({ ...fields,
  durationHours: count.refine(v => Number(v) <= 999, "小时数不能超过999").default(""),
  durationMinutes: count.refine(v => Number(v) <= 59, "分钟须为0至59").default(""),
  durationSeconds: count.refine(v => Number(v) <= 59, "秒数须为0至59").default(""),
  averageStayMinutes: z.string().regex(/^(\d+(\.\d{1,2})?)?$/, "停留分钟数最多两位小数").refine(v => Number(v) <= 59940, "停留时长超出范围").default(""),
}).superRefine((v, ctx) => {
  if (v.averageOnline !== "" && v.peakOnline !== "" && Number(v.averageOnline) > Number(v.peakOnline)) ctx.addIssue({ code: "custom", path: ["averageOnline"], message: "平均在线不能大于最高在线" });
  if (v.effectiveCount !== "" && v.backendJoinCount !== "" && Number(v.effectiveCount) > Number(v.backendJoinCount)) ctx.addIssue({ code: "custom", path: ["effectiveCount"], message: "有效人数不能大于后端加入人数" });
});
export const leadCommandSchema = z.object({
  id: z.string().min(1), version: z.coerce.number().int().min(0),
  command: z.enum(["claim", "save", "complete", "correctOwner", "delete", "restore"]),
  reason: z.string().trim().max(2000).default(""), userId: z.string().default(""), data: leadDataSchema.optional(),
});
