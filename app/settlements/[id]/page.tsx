import {notFound} from "next/navigation";
import {ReturnLink} from "@/components/context-link";
import {confirmedDetail} from "@/modules/settlements/queries";
import {dateRange} from "@/modules/live-reports/date-range";
import {SettlementForm,ConfirmedFields,Reason} from "@/components/settlement-forms";
import {formatDateTime} from "@/lib/datetime";
import {CorrectionHistory} from "@/components/work-corrections";
export default async function Page({params}:{params:Promise<{id:string}>}){
 const d=await confirmedDetail((await params).id);if(!d)notFound();const r=d.row;
 const labels:Record<string,string>={day:"日期",anchorName:"主播",backendName:"后端名称",backendUrl:"后端链接",joinCount:"加人数量",effectiveCount:"有效数量",backendUnitCents:"后端单价（分）",anchorUnitCents:"主播提成单价（分）",deletedAt:"删除时间"};
 return <><ReturnLink fallback="/settlements" label="返回确定数据"/><h1 className="text-2xl font-semibold">{r.day} · {r.anchorName} · {r.backendName}</h1><p className="text-sm text-slate-500">最近更新 {formatDateTime(r.updatedAt)} · 版本 {r.version}{r.deletedAt?" · 已删除":""}</p>{!r.deletedAt?<SettlementForm key={r.version} kind="confirmed" initial={{id:r.id,version:r.version}} label="保存更正"><ConfirmedFields row={r} anchors={d.anchors} backends={d.backends} yesterday={dateRange("yesterday")!.to}/></SettlementForm>:<p>已删除：加人 {r.joinCount}，有效 {r.effectiveCount}。历史内容和审计保留。</p>}<details className="rounded border p-4"><summary>{r.deletedAt?"恢复数据":"删除数据"}</summary><SettlementForm key={`recycle-${r.version}`} kind="recycle" initial={{id:r.id,version:r.version,operation:r.deletedAt?"restore":"delete"}} label={r.deletedAt?"确认恢复":"确认移入回收站"}><Reason/></SettlementForm></details><details className="rounded border p-4"><summary>修改记录</summary><CorrectionHistory rows={d.history.map(h=>{const v=h.detail as {actorName:string;reason:string;before:Record<string,unknown>|null;after:Record<string,unknown>};return {...h,detail:{actorName:v.actorName,reason:v.reason||"首次录入",changes:Object.entries(labels).filter(([key])=>JSON.stringify(v.before?.[key])!==JSON.stringify(v.after[key])).map(([key,label])=>({field:label,before:String(v.before?.[key]??"未记录"),after:String(v.after[key]??"未记录")}))}};})}/></details></>;
}
