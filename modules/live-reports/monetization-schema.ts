import { z } from "zod";
import { percentage } from "./schema";

export const monetizationFields = [
  ["fanGroupCount", "进粉丝群人数"], ["linkClickCount", "链接点击人数"],
  ["longPressCount", "长按人数"], ["backendJoinCount", "后端加入人数"], ["effectiveCount", "有效人数"],
] as const;
const count = z.string().regex(/^\d*$/, "请输入非负整数，暂未统计可留空").refine((v) => Number(v) <= 2_000_000_000, "数值超出范围");
export const monetizationSchema = z.object({
  reason: z.string().trim().max(2000).default(""),
  id: z.string().min(1), version: z.string().regex(/^\d+$/),
  fanGroupCount: count, linkClickCount: count, longPressCount: count.default(""), backendJoinCount: count, effectiveCount: count,
  salesStatus: z.enum(["UNFILLED", "NONE", "REPORTED"]).default("UNFILLED"),
  salesGmv: z.string().regex(/^(\d{1,12}(\.\d{1,2})?)?$/, "请输入非负金额，最多两位小数").default(""),
}).superRefine((v, ctx) => {
  if (v.effectiveCount !== "" && v.backendJoinCount !== "" && Number(v.effectiveCount) > Number(v.backendJoinCount)) {
    ctx.addIssue({ code: "custom", path: ["effectiveCount"], message: "有效人数不能大于后端加入人数" });
  }
  if (v.salesStatus === "REPORTED" && v.salesGmv === "") ctx.addIssue({ code: "custom", path: ["salesGmv"], message: "请填写带货 GMV，确为零时填 0" });
  if (v.salesStatus !== "REPORTED" && v.salesGmv !== "") ctx.addIssue({ code: "custom", path: ["salesGmv"], message: "请先选择已统计带货 GMV" });
});
export type MonetizationInput = z.infer<typeof monetizationSchema>;
export function conversion(numerator: number | null, denominator: number | null): string {
  return numerator === null || denominator === null ? "—" : percentage(numerator, denominator);
}
