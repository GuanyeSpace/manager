import { z } from "zod";
export const carriers = ["中国电信", "中国联通", "中国移动", "网络卡"] as const;
export const numberStatuses = { NORMAL: "正常", SUSPENDED: "停机", CANCELLED: "注销" } as const;
export function numberStatus(status: string | null, active: boolean) { return status && status in numberStatuses ? status as keyof typeof numberStatuses : active ? "NORMAL" : "SUSPENDED"; }
export const pageSizeSchema = z.coerce.number().refine(value => [10, 20, 50].includes(value)).catch(20);
export const numberFiltersSchema = z.object({ openedBy: z.string().trim().max(100).default(""), userId: z.string().max(100).default(""), status: z.enum(["", "NORMAL", "SUSPENDED", "CANCELLED"]).default("") });
export type NumberFilters = z.infer<typeof numberFiltersSchema>;
export const resourceKinds = ["rooms", "numbers", "phones", "equipment", "materials"] as const;
export type ResourceKind = typeof resourceKinds[number];
export const resourceLabels = { rooms: "直播间", numbers: "手机号", phones: "手机", equipment: "设备", materials: "物资" };
export function isResourceKind(value: string): value is ResourceKind { return resourceKinds.some(k => k === value); }
const text = (max: number) => z.string().trim().max(max).default("");
const id = text(100);
const money = text(20).refine(v => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) <= 21474836.47), "金额须为非负数，最多两位小数且不超过 21474836.47 元");
export function deviceKind(kind: ResourceKind) { return kind === "phones" ? "PHONE" as const : kind === "materials" ? "MATERIAL" as const : "EQUIPMENT" as const; }
export function devicePath(kind: string) { return kind === "PHONE" ? "phones" : kind === "MATERIAL" ? "materials" : "equipment"; }
export function toCents(value: string) { if (!value) return null; const [whole, fraction = ""] = value.split("."); return Number(whole) * 100 + Number(fraction.padEnd(2, "0")); }
export function moneyInput(value: number | null) { return value === null ? "" : (value / 100).toFixed(2); }
export function moneyLabel(value: number | null) { return value === null ? "未登记" : `¥${(value / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
export const resourceSchema = z.object({
  individual: z.boolean().default(false),
  id, version: z.coerce.number().int().min(0), branchId: z.string().min(1, "请选择分公司"),
  roomId: id, operatorId: id, controllerId: id, userId: id,
  active: z.enum(["true", "false"]).default("true"),
  name: text(100), location: text(300), anchorIds: z.array(z.string().min(1).max(100)).max(50).default([]),
  number: text(30), openedBy: text(100), accountId: id, wechat: text(100), carrier: text(100), plan: text(300),
  xiaohongshu: text(100), kuaishou: text(100), monthlyFee: money,
  dataGb: text(20).refine(v => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) <= 99999999.99), "套餐流量须为非负数，最多两位小数"),
  cardType: z.enum(["", "MAIN", "SECONDARY"]).default(""), mainCardId: id,
  status: z.enum(["", "NORMAL", "SUSPENDED", "CANCELLED"]).default(""),
  phoneDeviceId: id, phoneSlot: z.enum(["", "1", "2"]).default(""), otherPhone: text(300),
  loginAccountIds: z.array(z.string().min(1).max(100)).max(50).optional(),
  loginWechats: z.string().trim().max(2000).optional(),
  code: text(100), model: text(200), category: text(100), serialNumber: text(100), sim1: id, sim2: id,
  quantity: text(10).refine(v => v === "" || (/^[1-9]\d*$/.test(v) && Number(v) <= 1000000), "数量须为 1 至 1000000 的整数"),
  unit: text(20), purchaseUnitPrice: money, currentUnitValue: money,
  purchaseDate: text(10).refine(v => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v), "请输入有效购入日期"),
  purpose: text(500), notes: text(2000),
});
export type ResourceInput = z.infer<typeof resourceSchema>;
export type ResourceState = { error?: string } | undefined;
export function normalizeNumber(value: string) { return value.replace(/[\s()-]/g, ""); }

export function itemCodes(code: string, quantity: number) { return Array.from({ length: quantity }, (_, i) => `${code}-${String(i + 1).padStart(3, "0")}`); }
