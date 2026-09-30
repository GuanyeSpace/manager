import Link, { ReturnLink } from "@/components/context-link";
import { notFound } from "next/navigation";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getResource, getAnchors } from "@/modules/resources/queries";
import { numberStatuses, moneyLabel, toCents, isResourceKind, resourceLabels } from "@/modules/resources/schema";
import { MaterialSplitForm } from "@/components/material-split-form";
import { ResourceForm } from "@/components/resource-form";
import { AnchorDirectory } from "@/components/anchor-directory";
export default async function ResourceDetailPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  const { kind, id } = await params;
  if (kind === "anchors") { if (!(await getAnchors(id)).anchors.length) notFound(); return <AnchorDirectory id={id} />; }
  if (!isResourceKind(kind)) notFound(); const detail = await getResource(kind, id); if (!detail) notFound();
  const a = detail.initial;
  const fields = kind === "rooms" ? [["位置", a.location]] : kind === "numbers" ? [["开户人", a.openedBy], ["绑定微信号", a.wechat], ["绑定小红书", a.xiaohongshu], ["绑定快手号", a.kuaishou], ["运营商", a.carrier], ["主 / 副卡", a.cardType === "SECONDARY" ? "副卡（共用主卡套餐）" : a.cardType === "MAIN" ? "主卡" : "待确认"], ["每月套餐费", moneyLabel(toCents(a.monthlyFee))], ["套餐流量", a.dataGb ? `${a.dataGb} G` : "未登记"], ["原套餐说明", a.plan], ["其他所在手机", a.otherPhone], ["其他用途", a.purpose]] : [[kind === "materials" ? "名称 / 规格" : "型号", a.model], ["类型", a.category], [kind === "phones" ? "序列号 / IMEI" : "序列号", a.serialNumber], ["用途", a.purpose]];
  if (kind === "phones") fields.push(["登录微信号", a.loginWechats || "未登记"]);
  if (kind !== "rooms" && kind !== "numbers") {
    const quantity = a.quantity ? Number(a.quantity) : null, purchase = toCents(a.purchaseUnitPrice), value = toCents(a.currentUnitValue);
    fields.push(["数量", quantity === null ? "未登记" : `${quantity} ${a.unit}`], ["购入日期", a.purchaseDate], ["购入单价", moneyLabel(purchase)], ["购入总额", moneyLabel(quantity !== null && purchase !== null ? quantity * purchase : null)], ["当前单件估值", moneyLabel(value)], ["当前估值总额", moneyLabel(quantity !== null && value !== null ? quantity * value : null)]);
  }
  return <><header className="space-y-2"><ReturnLink fallback={`/resources/${kind}`} label={`返回${resourceLabels[kind]}管理`} /><h1 className="text-2xl font-semibold">{a.name || a.number || a.code}</h1></header>
    {detail.splitAt && <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">此批次已拆分，以下是原始资料，不再计入现有数量或资产价值。请从右侧进入单件档案分配使用人和直播间。</p>}
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="min-w-0 space-y-6"><section className="grid gap-4 rounded-xl border p-5 text-sm sm:grid-cols-2"><p>分公司：{detail.branchName}</p><p>状态：{kind === "numbers" && a.status ? numberStatuses[a.status] : detail.splitAt ? "已拆分（只读来源）" : a.individual ? "单件物资 · " + (a.active === "true" ? "启用" : "停用") : a.active === "true" ? "启用" : "停用"}</p><p>运营：{detail.operatorName ?? "未分配"}</p><p>直播中控：{detail.controllerName ?? "未分配"}</p>{kind !== "rooms" && <p>使用人：{detail.userName ?? "未分配"}</p>}{fields.map(([label, value]) => <p key={label} className="break-words">{label}：{value || "未填写"}</p>)}<p className="whitespace-pre-wrap break-words sm:col-span-2">备注：{a.notes || "未填写"}</p></section>
    {kind === "materials" && detail.editable && !a.individual && a.active === "true" && Number(a.quantity) >= 2 && Number(a.quantity) <= 100 && <MaterialSplitForm key={a.version} initial={a} />}
    {detail.editable && detail.options && <details className="rounded-xl border p-5"><summary className="cursor-pointer font-semibold">编辑{resourceLabels[kind]}资料</summary><div className="mt-5"><ResourceForm key={a.version} kind={kind} options={detail.options} initial={a} /></div></details>}</div>
    <aside className="space-y-4 rounded-xl border p-5"><h2 className="font-semibold">关联信息</h2>{detail.related.length ? detail.related.map((r, i) => <Link key={i} href={r.href} className="block rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{r.label}</p><p className="mt-1 break-words text-sm font-medium">{r.title} →</p></Link>) : <p className="text-sm text-muted-foreground">暂未关联其他可见资料</p>}{kind === "rooms" && <p className="text-xs text-muted-foreground">抖音账号、手机号、手机、设备和物资在各自管理页选择所属直播间后，会显示在这里。</p>}</aside></div>
  </>;
}
