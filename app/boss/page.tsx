import Link from "@/components/context-link";
import { requireBossPage } from "@/lib/auth/permissions";
import { getWorkbench } from "@/modules/workbench/queries";
export default async function BossPage() {
  const user = await requireBossPage();
  const data = await getWorkbench();
  return <><header><p className="mb-2 text-sm text-muted-foreground">你好，{user.name}</p><h1 className="text-2xl font-semibold">管理概览</h1><p className="mt-2 text-sm text-muted-foreground">统一安排账号流程、人员与物资，跟进每场直播的执行和数据。</p></header><div className="grid gap-4 sm:grid-cols-3">{[["可管理账号", data.accounts.length], ["正在直播", data.sessions.filter(s => s.phase === "LIVE").length], ["待收尾场次", data.sessions.filter(s => s.phase === "WRAP").length]].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p></div>)}</div><section className="grid gap-4 md:grid-cols-2">{[["/account-config", "配置账号工作内容", "选择抖音账号，安排开播前检查、直播中事项、收尾流程和专属话术。"], ["/live-reports", "查看直播数据", "查看各账号每场直播表现。"], ["/live-reports?view=monetization", "查看打粉数据", "查看进群、卡片点击、后端加入、有效人数及转化率。"], ["/workbench/history", "检查场次执行", "查看完成时间、执行备注和本场违规记录。"], ["/resources/rooms", "管理直播间与人员", "关联主播、账号和物资，明确所属分公司与负责人。"]].map(([href, title, detail]) => <Link href={href} key={href} className="rounded-xl border bg-white p-5 hover:bg-slate-100"><h2 className="font-semibold">{title} →</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p></Link>)}</section></>;
}
