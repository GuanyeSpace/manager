import { z } from "zod";
import { metricFields } from "@/modules/live-reports/schema";
import { audienceFields, audienceInput, durationFromParts, parseDuration, powderFields } from "@/modules/live-reports/input-metrics";

export const leadFields = [["durationHours", "直播时长（小时）"], ["durationMinutes", "直播时长（分钟）"], ["durationSeconds", "直播时长（秒）"], ...metricFields, ["averageStayMinutes", "人均停留（分钟）"], ...powderFields, ...audienceFields, ["durationText", "直播时长"], ["leadMode", "本场是否导粉"]] as const;
export const activeLeadFields = leadFields.filter(([key]) => !["durationHours", "durationMinutes", "durationSeconds"].includes(key));
export type LeadValues = Record<typeof leadFields[number][0], string>;
export function leadValues(data: unknown): LeadValues {
  const original = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const value: Record<string, unknown> = { ...original, durationText: typeof original.durationText === "string" ? original.durationText : durationFromParts(original) };
  return Object.fromEntries(leadFields.map(([key]) => [key, typeof value[key] === "string" ? value[key] : ""])) as LeadValues;
}
const count = z.string().regex(/^\d*$/, "请输入非负整数").refine(v => Number(v) <= 2_000_000_000, "数值超出范围");
const fields = Object.fromEntries(leadFields.map(([key]) => [key, count.default("")])) as unknown as Record<keyof LeadValues, z.ZodType<string>>;
export const leadDataSchema = z.object({ ...fields,
  ...Object.fromEntries(powderFields.map(([key])=>[key,z.string().max(40).default("")])) as Record<typeof powderFields[number][0],z.ZodString | z.ZodDefault<z.ZodString>>,
  leadMode: z.enum(["", "yes", "no"]).default(""),
  durationText: z.string().trim().refine(v => !v || parseDuration(v) !== null, "直播时长请填写如1小时1分钟18秒，分钟和秒须为0至59").default(""),
  femalePercent: audienceInput, age31To40Percent: audienceInput,
  durationHours: count.refine(v => Number(v) <= 999, "小时数不能超过999").default(""),
  durationMinutes: count.refine(v => Number(v) <= 59, "分钟须为0至59").default(""),
  durationSeconds: count.refine(v => Number(v) <= 59, "秒数须为0至59").default(""),
  averageStayMinutes: z.string().regex(/^(\d+(\.\d{1,2})?)?$/, "停留分钟数最多两位小数").refine(v => Number(v) <= 59940, "停留时长超出范围").default(""),
}).superRefine((v, ctx) => {
  if (v.averageOnline !== "" && v.peakOnline !== "" && Number(v.averageOnline) > Number(v.peakOnline)) ctx.addIssue({ code: "custom", path: ["averageOnline"], message: "平均在线不能大于最高在线" });
  if(v.leadMode !== "no") for(const [key] of powderFields) if(!count.safeParse(v[key]).success) ctx.addIssue({code:"custom",path:[key],message:"请输入非负整数，数值不能超过20亿"});
  if (v.leadMode !== "no" && v.effectiveCount !== "" && v.backendJoinCount !== "" && Number(v.effectiveCount) > Number(v.backendJoinCount)) ctx.addIssue({ code: "custom", path: ["effectiveCount"], message: "有效人数不能大于后端加入人数" });
});
export const leadCommandSchema = z.object({
  id: z.string().min(1), version: z.coerce.number().int().min(0),
  command: z.enum(["claim", "release", "correctActual", "save", "complete", "correctOwner", "delete", "restore"]),
  actualLeadId: z.string().default(""),
  reason: z.string().trim().max(2000).default(""), userId: z.string().default(""), data: leadDataSchema.optional(),
});
