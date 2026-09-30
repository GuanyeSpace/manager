import { accountStatusLabel } from "@/lib/account-status";
import Link from "@/components/context-link";
import { notFound, redirect } from "next/navigation";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getWorkspace, getWorkSession, getShift } from "@/modules/workbench/queries";
import { defaultWorkflow, phases, phaseLabels, workflowSchema } from "@/modules/workbench/schema";
import { WorkActionForm } from "@/components/work-action-form";
import { WorkflowEditor } from "@/components/workflow-editor";
import { WorkScripts } from "@/components/work-scripts";
import { WorkStageTabs } from "@/components/work-stage-tabs";
import { WorkTaskRow } from "@/components/work-task-row";
import { WorkSessionView } from "@/components/work-session-view";
export default async function AccountWorkspace({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sessionId?: string }> }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  const { id } = await params, { sessionId } = await searchParams;
  const result = await getWorkspace(id); if (!result) notFound();
  const { account: a, current, wrapping, controllers, editable, scriptsEditable, executable } = result;
  if (sessionId) {
    const work = await getWorkSession(sessionId);
    if (!work || work.session.accountId !== id) notFound();
    return <><Link href={`/workbench/accounts/${id}`} className="text-sm text-muted-foreground">← 账号直播流程 / 准备下一场</Link><WorkSessionView id={sessionId} /></>;
  }
  if (current) redirect(`/workbench/accounts/${id}?sessionId=${current.id}`);
  const workflow = a.workflow ? workflowSchema.parse(a.workflow.content) : { ...defaultWorkflow, before: [], live: [], after: [] };
  const { shift } = await getShift();
  const ready = !!shift && !!a.controllerId && executable && !a.banned && a.active && a.branch.status === "ACTIVE" && a.anchorId && a.workflow;
  return <><header className="space-y-2"><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">{a.name} · 直播流程</h1><span className="rounded-full bg-muted px-3 py-1 text-sm">待开始准备</span></div><p className="text-sm text-muted-foreground">{a.branch.name} · 主播 {a.anchor?.name ?? "未绑定"} · 运营 {a.operator?.name ?? "无"} · 直播中控 {a.controller?.name ?? "无"}</p></header>
    {a.banned && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{accountStatusLabel(a)}。确认解封后由管理人员恢复启用。</p>}
    {wrapping.length > 0 && <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold">此账号还有 {wrapping.length} 场待收尾</h2><p className="text-sm">继续完成下播检查和违规记录；如需开下一场，可在下方开始准备。</p>{wrapping.map(s => <Link key={s.id} href={`/workbench/accounts/${id}?sessionId=${s.id}`} className="block text-sm underline">{s.label} · {s.endedAt?.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · 继续收尾 →</Link>)}</section>}
    <section className="space-y-3 rounded-xl border bg-white p-5"><h2 className="font-semibold">开始本场准备</h2>{ready ? <WorkActionForm fields={{ id, version: 0, command: "create" }}><p className="text-sm text-muted-foreground">开始准备后自动建立本场记录，下方按流程逐项勾选，完成时间自动记录。</p><div className="flex flex-wrap gap-3"><label className="text-sm">本场直播中控 <select name="actualControllerId" defaultValue={user.id} className="rounded-lg border px-3 py-2">{!controllers.some(p => p.id === user.id) && <option value={user.id}>{user.name}（本人）</option>}{controllers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="rounded-lg bg-primary px-5 py-2 text-sm text-primary-foreground">开始本场准备</button></div></WorkActionForm> : <p className="text-sm text-muted-foreground">{a.banned ? "账号封禁期间不能开始准备。" : !shift ? "请先在“上班/下班”登记上班，再开始本场准备。" : !a.controllerId ? "请先为直播账号绑定直播中控。" : !a.workflow ? "尚未配置流程，请联系负责运营、分公司负责人或老板。" : !a.anchorId ? "账号尚未绑定主播，请联系负责人完成分配。" : !executable ? "本场由负责直播中控执行。" : "账号或分公司已停用，请联系负责人。"}</p>}{!shift && <Link href="/workbench/attendance" className="inline-block text-sm underline">前往上班/下班 →</Link>}{editable && <Link href={`/account-config/${id}`} className="inline-block text-sm text-primary">配置本账号流程与话术 →</Link>}</section>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]"><div className="min-w-0 space-y-5"><WorkStageTabs initial="before" items={phases.map(phase => ({ id: phase, label: phaseLabels[phase], content: <section className="overflow-hidden rounded-xl border bg-white"><h2 className="p-5 font-semibold">{phaseLabels[phase]} · {workflow[phase].length} 项</h2><div className="overflow-x-auto"><table className="w-full min-w-[620px] table-fixed text-left"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{phase === "live" && <th className="w-[22%] p-3">开播时间</th>}<th className="p-3">工作内容</th><th className="w-[24%] p-3">完成情况 / 完成时间</th><th className="w-[24%] p-3">备注</th></tr></thead><tbody>{workflow[phase].map((task, index) => <WorkTaskRow key={index} id={id} version={0} phase={phase} index={index} task={task} editable={false} startedAt={null} />)}</tbody></table>{!workflow[phase].length && <p className="p-5 text-sm text-muted-foreground">{a.workflow ? "本阶段未配置事项" : "等待负责人配置"}</p>}</div><p className="p-4 text-xs text-muted-foreground">开始本场准备后可勾选当前阶段的事项。</p></section> }))} /><section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">本场收尾</h2><p className="mt-2 text-sm text-muted-foreground">下播后在本页面完成检查，记录违规情况并确认收尾。</p></section></div><aside className="min-w-0 space-y-5 xl:sticky xl:top-20"><WorkScripts workflow={workflow} />{scriptsEditable && a.workflow && <details className="rounded-xl border bg-white p-5"><summary className="cursor-pointer font-semibold">编辑账号话术</summary><WorkflowEditor key={a.workflow.version} accountId={id} version={a.workflow.version} initial={workflow} scriptsOnly /></details>}</aside></div>
  </>;
}
