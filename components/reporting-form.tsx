"use client";
import { useActionState,useState,startTransition } from "react";
import { useRouter } from "next/navigation";
import { reportingAction,type ReportingState } from "@/modules/reporting/actions";
import { ReportMetricSections } from "./report-metric-sections";
export function ReportingForm({id,version,initial,submitted=false,editable=true,ended=true,role}:{id?:string;version:number;initial?:Record<string,string>;submitted?:boolean;editable?:boolean;ended?:boolean;role?:string}){
 const router=useRouter();const [values,setValues]=useState(initial??{});const [initialVersion]=useState(version);
 const [state,action,pending]=useActionState(async(prev:ReportingState,form:FormData)=>{const result=await reportingAction(prev,form);if(result.success)router.refresh();return result;},{});
 const stale=version!==(state.savedVersion??initialVersion);
 return <form className="space-y-4" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);form.set("command",((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value??"save");startTransition(()=>action(form));}}>
 <input type="hidden" name="mode" value={id?"live":"setting"}/><input type="hidden" name="id" value={id??""}/><input type="hidden" name="version" value={state.savedVersion??initialVersion}/>
 {id?<><p className="text-sm text-muted-foreground">只填写本场直播数据；打粉数据由导粉专员维护。提交完整后才能收尾。</p><ReportMetricSections values={values} onChange={(k,v)=>setValues(old=>({...old,[k]:v}))} disabled={!editable||!ended||pending} completed={submitted}/>{submitted&&editable&&<label className="block text-sm">更正原因<textarea name="reason" required maxLength={2000} className="block w-full rounded border p-2"/></label>}</>:<label className="block space-y-2">直播数据填写岗位<select name="role" defaultValue={role} className="block rounded border p-2"><option value="LEAD_SPECIALIST">导粉专员</option><option value="CONTROLLER">直播中控</option></select><span className="block text-sm text-muted-foreground">只对之后新建的准备场次生效，已有场次不变；外部主播直接录入不受影响。</span></label>}
 {id&&!ended&&<p>实际下播后开放填写。</p>}{stale&&<p role="alert">数据已更新，请保留输入后刷新核对。</p>}
 {editable&&<div className="flex gap-3"><button disabled={pending||stale||!ended} value="save" className="rounded border px-4 py-2 disabled:opacity-50">{!id?"保存设置":submitted?"保存更正":"保存草稿"}</button>{id&&!submitted&&<button value="complete" disabled={pending||stale||!ended} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">提交完成</button>}</div>}
 {state.error&&<p role="alert" className="text-red-700">{state.error}</p>}{state.success&&<p role="status">{state.success}</p>}
 </form>;
}
