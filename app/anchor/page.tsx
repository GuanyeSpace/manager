import {notFound} from "next/navigation";
import Link from "next/link";
import {requirePageUser,requirePasswordChanged} from "@/lib/auth/permissions";
import {hasRole} from "@/lib/auth/roles";
import {LogoutButton} from "@/components/logout-button";
import {anchorIncome} from "@/modules/settlements/queries";
import {settlementFilters} from "@/modules/settlements/schema";
import {SettlementFilters} from "@/components/settlement-filters";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const user=await requirePageUser();await requirePasswordChanged(user);if(!hasRole(user,"ANCHOR"))notFound();const raw=await searchParams;if(!settlementFilters.safeParse(raw).success)return <p>筛选日期无效</p>;const d=await anchorIncome(raw);
 return <div className="min-h-screen bg-slate-50"><header className="flex h-16 items-center justify-between border-b bg-white px-6"><h1 className="font-semibold">主播工作台</h1><div className="flex items-center gap-4 text-sm"><span>{user.name}</span><Link href="/change-password">修改密码</Link><LogoutButton/></div></header><main className="mx-auto max-w-6xl space-y-5 p-6"><h2 className="text-xl font-semibold">打粉数量与提成</h2><p className="text-sm text-slate-500">仅展示老板已保存的确定数据，没有记录的日期不展示。提成按有效数量计算，提成金额不代表已发放。周/月仅汇总所选日期范围内的记录。</p><SettlementFilters path="/anchor" filters={d.filters} groups/><div className="grid gap-4 sm:grid-cols-3">{[["加人数量",d.totals.joins],["有效数量",d.totals.effective],["提成金额（元）",d.totals.income]].map(([label,value])=><div key={label} className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div><div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead><tr>{["日期 / 期间","加人数量","有效数量","提成金额（元）"].map(t=><th key={t} className="p-4">{t}</th>)}</tr></thead><tbody>{d.rows.map(r=><tr key={r.period} className="border-t"><td className="p-4">{r.period}</td><td className="p-4">{r.joins}</td><td className="p-4">{r.effective}</td><td className="p-4">{r.income}</td></tr>)}{!d.rows.length&&<tr><td colSpan={4} className="p-8 text-center text-slate-500">所选范围暂无确定数据</td></tr>}</tbody></table></div></main></div>;
}
