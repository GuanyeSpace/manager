import { z } from "zod";

export const accountSchema = z.object({
  id: z.string().default(""),
  version: z.coerce.number().int().min(0),
  douyinId: z.string().trim().min(1, "请输入抖音号").max(100),
  name: z.string().trim().min(1, "请输入账号名称").max(100),
  homepageUrl: z.string().trim().max(500).refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && (url.hostname === "douyin.com" || url.hostname.endsWith(".douyin.com"));
    } catch { return false; }
  }, "请输入 HTTPS 抖音主页链接"),
  realName: z.string().trim().max(100),
  phoneNumberId: z.string().max(100).optional(),
  roomId: z.string().max(100).optional(),
  phone: z.string().trim().max(30).refine((v) => !v || /^[+\d ()-]{5,30}$/.test(v), "请输入有效手机号"),
  purpose: z.string().trim().max(200),
  notes: z.string().trim().max(2000),
  branchId: z.string().min(1, "请选择分公司"),
  operatorId: z.string(),
  controllerId: z.string().default(""),
  anchorId: z.string(),
  externalAnchorId: z.string().max(100).optional(),
  active: z.enum(["true", "false", "banned"]),
  unbanDate: z.string().optional().refine(value => {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "请输入有效的预计解封日期"),
});
export type AccountInput = z.infer<typeof accountSchema>;
export type AccountFormState = { error?: string; fieldErrors?: Record<string, string[] | undefined> } | undefined;
export const managerSchema = z.object({
  branchId: z.string().min(1),
  managerId: z.string(),
  previousManagerId: z.string(),
});
