import { notFound } from "next/navigation";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getLeadClaim } from "@/modules/leads/queries";
import { LeadCommandForm, leadInputClass } from "@/components/lead-form";
import { ReturnLink } from "@/components/context-link";
import { formatDateTime } from "@/lib/datetime";
export default async function ClaimPage({params}:{params:Promise<{id:string}>}) {
  const user=await requirePageUser(); await requirePasswordChanged(user);
  const {id}=await params, result=await getLeadClaim(id); if(!result) notFound();
  const {session:s,people,defaultPersonId}=result;
  return <><ReturnLink fallback="/leads?view=available" label="返回可认领场次"/><header className="space-y-2"><h1 className="text-2xl font-semibold">确认负责本场</h1><p>{s.sourceRecord.name} · {s.label}</p><p className="text-sm">主播：{s.actualAnchorName??s.sourceRecord.anchorName??"未记录"} · 开播：{formatDateTime(s.startedAt!)}</p></header>
    <LeadCommandForm id={id} version={0} command="claim" label="确认负责本场"><label className="block text-sm">本场实际导粉专员<select name="actualLeadId" required defaultValue={defaultPersonId} className={leadInputClass}><option value="" disabled>请选择</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><p className="text-sm text-muted-foreground">仍由当前登录账号填写，选择人员仅用于记录本场实际导粉人员，不授予其账号访问权限。</p></LeadCommandForm></>;
}
