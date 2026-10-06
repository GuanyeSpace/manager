import {ConfirmedTable} from "@/components/settlement-status";
import Link from "@/components/context-link";
import {confirmedList} from "@/modules/settlements/queries";
import {settlementFilters} from "@/modules/settlements/schema";
import {SettlementFilters} from "@/components/settlement-filters";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const raw=await searchParams;if(!settlementFilters.safeParse(raw).success)return <p>筛选条件无效，请检查日期。</p>;const d=await confirmedList(raw),f=d.filters;
 const url=(page:number,trash=f.trash)=>`/settlements?${new URLSearchParams({from:f.from,to:f.to,anchorId:f.anchorId,backendId:f.backendId,page:String(page),trash,status:f.status,...(f.preset?{preset:f.preset}:{})})}`;
 return <><header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">确定打粉数据{f.trash==="true"?" · 回收站":""}</h1><nav className="flex gap-4 text-sm"><Link href="/settlements/new">录入确定数据</Link><Link href="/settlements/backends">后端资料</Link><Link href={url(1,f.trash==="true"?"false":"true")}>{f.trash==="true"?"正常数据":"回收站"}</Link></nav></header><p className="text-sm text-slate-500">仅登记昨天及以前；保存即展示给主播。总价和主播提成都按有效数量计算。“已结算”仅表示后端已给公司结清，不代表主播提成已发放。</p><SettlementFilters path="/settlements" filters={f} anchors={d.anchors} backends={d.backends} showStatus/><p className="rounded border bg-white p-3 text-sm">筛选合计：{d.count}条 · 加人 {d.summary.joins} · 有效 {d.summary.effective} · 总价 ¥{d.summary.revenue} · 主播提成 ¥{d.summary.commission}</p><ConfirmedTable key={`${f.page}-${f.from}-${f.to}-${f.anchorId}-${f.backendId}-${f.trash}-${f.status}-${d.rows.map(r=>r.id+":"+r.version).join(",")}`} rows={d.rows}/><nav className="flex justify-between text-sm">{f.page>1?<Link href={url(f.page-1)}>上一页</Link>:<span/>}<span>{f.page} / {d.pages}</span>{f.page<d.pages?<Link href={url(f.page+1)}>下一页</Link>:<span/>}</nav></>;
}
