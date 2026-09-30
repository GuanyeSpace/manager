import { WorkflowCopy } from "@/components/workflow-copy";
import Link from "@/components/context-link";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getConfigAccounts } from "@/modules/workbench/queries";
export default async function ConfigPage() {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  const accounts = await getConfigAccounts();
  return <><header><h1 className="text-2xl font-semibold">抖音账号配置</h1><p className="mt-2 text-sm text-muted-foreground">选择账号，独立配置三阶段工作流程和话术。老板、所属分公司负责人及负责运营可修改流程。</p></header><WorkflowCopy accounts={accounts} /><div className="grid gap-4 md:grid-cols-2">{accounts.map(a => <Link key={a.id} href={`/account-config/${a.id}`} className="rounded-xl border p-5 hover:bg-muted/30"><h2 className="font-semibold">{a.name}</h2><p className="mt-2 text-sm text-muted-foreground">{a.branchName} · {a.douyinId}</p><p className="mt-4 text-sm">{a.version ? `第 ${a.version} 版流程` : "尚未配置"} · 配置流程与话术 →</p></Link>)}</div>{!accounts.length && <p className="py-8 text-sm text-muted-foreground">暂无可配置的账号，请先完成账号及负责人分配。</p>}</>;
}
