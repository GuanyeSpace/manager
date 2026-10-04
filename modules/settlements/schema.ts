import { z } from "zod";
import { shanghaiDate, shanghaiInput } from "@/modules/live-reports/schema";
import { dateRange } from "@/modules/live-reports/date-range";
const id = z.string().max(100);
export const daySchema = z.string().refine(v => !!shanghaiDate(v + "T00:00"), "请选择有效日期");
const count = z.string().regex(/^\d+$/, "数量须为非负整数").refine(v=>Number(v)<=2_000_000_000,"数量超出范围").transform(Number);
export function unitCents(value:string) { const [whole,fraction=""]=value.split("."); return Number(whole)*100+Number(fraction.padEnd(2,"0")); }
const money = z.string().regex(/^\d{1,7}(\.\d{1,2})?$/, "单价最多7位整数和2位小数").transform(unitCents);
export const backendSchema = z.object({ notes: z.string().trim().max(2000).optional(), id: id.default(""), version: z.coerce.number().int().min(0), name: z.string().trim().min(1,"请填写后端名称").max(100), active: z.enum(["true","false"]).transform(v=>v==="true"), reason: z.string().trim().max(2000).default("") });
export const confirmedSchema = z.object({ id: id.default(""), version: z.coerce.number().int().min(0), day: daySchema, anchorId: id.min(1), backendId: id.min(1), joinCount: count, effectiveCount: count, backendUnit: money, anchorUnit: money, reason: z.string().trim().max(2000).default("") }).refine(v=>v.effectiveCount<=v.joinCount,{message:"有效数量不能超过加人数量",path:["effectiveCount"]});
export const recycleSchema = z.object({id:id.min(1), version:z.coerce.number().int().min(1), operation:z.enum(["delete","restore"]), reason:z.string().trim().min(1,"请填写操作原因").max(2000)});
export const settlementFilters = z.object({from:z.string().default(""),to:z.string().default(""),preset:z.enum(["yesterday","7d","30d","month","lastMonth"]).optional(),anchorId:id.default(""),backendId:id.default(""),trash:z.enum(["true","false"]).default("false"),page:z.coerce.number().int().min(1).catch(1),group:z.enum(["day","week","month"]).default("day")}).superRefine((v,ctx)=>{if(v.preset)return;for(const key of ["from","to"] as const)if(v[key]&&!daySchema.safeParse(v[key]).success)ctx.addIssue({code:"custom",path:[key],message:"日期无效"});if(v.from&&v.to&&v.from>v.to)ctx.addIssue({code:"custom",path:["to"],message:"结束日期不能早于开始日期"});});
export function resolveFilters(raw: unknown, now=new Date(), defaultMonth=false) {
  const f=settlementFilters.parse(raw);
  const preset=f.preset ?? (defaultMonth&&!f.from&&!f.to ? "month":undefined);
  return {...f,...(preset ? dateRange(preset,now):{}),preset};
}
export function pastDay(day:string,now=new Date()) { return day<shanghaiInput(now).slice(0,10); }
export const totalCents=(count:number,unit:number)=>BigInt(count)*BigInt(unit);
export function moneyText(cents:bigint) { return `${cents/BigInt(100)}.${String(cents%BigInt(100)).padStart(2,"0")}`; }
export function period(day:string,group:"day"|"week"|"month") {
  if(group==="month")return day.slice(0,7);
  if(group==="day")return day;
  const d=new Date(day+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return `${start} ~ ${d.toISOString().slice(0,10)}`;
}
