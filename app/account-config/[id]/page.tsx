import { WorkflowCopy } from "@/components/workflow-copy";
import { ReturnLink } from "@/components/context-link";
import { notFound } from "next/navigation";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getWorkspace, getConfigAccounts } from "@/modules/workbench/queries";
import { defaultWorkflow, workflowSchema } from "@/modules/workbench/schema";
import { WorkflowEditor } from "@/components/workflow-editor";
export default async function ConfigAccount({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  const { id } = await params, result = await getWorkspace(id);
  if (!result?.editable) notFound();
  const a = result.account;
  const accounts = await getConfigAccounts();
  return <><header><ReturnLink fallback="/account-config" label="返回账号配置列表" /><h1 className="mt-3 text-2xl font-semibold">{a.name} · 流程与话术配置</h1><p className="mt-2 text-sm text-muted-foreground">{a.branch?.name ?? "外部账号"} · 抖音号 {a.douyinId} · {a.workflow ? `第 ${a.workflow.version} 版` : "待配置"}</p></header><WorkflowCopy accounts={accounts} currentId={id} /><WorkflowEditor key={a.workflow?.version ?? 0} accountId={id} version={a.workflow?.version ?? 0} initial={a.workflow ? workflowSchema.parse(a.workflow.content) : defaultWorkflow} /></>;
}
