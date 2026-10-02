import {ReturnLink} from "@/components/context-link";
import {confirmedOptions} from "@/modules/settlements/queries";
import {dateRange} from "@/modules/live-reports/date-range";
import {SettlementForm,ConfirmedFields} from "@/components/settlement-forms";
export default async function Page(){const d=await confirmedOptions();return <><ReturnLink fallback="/settlements" label="返回确定数据"/><h1 className="text-2xl font-semibold">录入确定打粉数据</h1><SettlementForm kind="confirmed" initial={{id:"",version:0}}><ConfirmedFields {...d} yesterday={dateRange("yesterday")!.to}/></SettlementForm></>;}
