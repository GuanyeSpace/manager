import { accountStatusLabel } from "@/lib/account-status";
import { canViewLiveReports } from "@/lib/auth/live-report-permissions";
import Link, { ReturnLink } from "@/components/context-link";
import { notFound } from "next/navigation";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getAccountDetail } from "@/modules/accounts/queries";
import { AccountForm } from "@/components/account-form";
import { AccountHistory } from "@/components/account-history";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  const { id } = await params;
  const { account, history, canEdit, options, phones } = await getAccountDetail(id);
  if (!account && !history.length) notFound();
  return <>
    <ReturnLink fallback="/accounts" label="返回抖音账号管理" />
    <h1 className="text-2xl font-semibold">{account?.name ?? "账号历史记录"}</h1>
    {account ? <>
      {canEdit && <Link href={`/account-config/${account.id}`} className="text-sm text-primary">配置账号流程与话术 →</Link>}
      <Link href={`/workbench/accounts/${account.id}`} className="text-sm text-primary">进入账号直播工作空间 →</Link>
      {canViewLiveReports(user) && <Link href={`/live-reports?accountId=${encodeURIComponent(account.id)}`} className="text-sm text-primary">查看此账号直播数据 →</Link>}
      <section className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
        <p>抖音号：{account.douyinId}</p><p>分公司：{account.branch?.name ?? "外部账号"}</p>
        <p>实名人：{account.realName || "未填写"}</p><p>绑定手机号：{account.phoneNumber ? <Link className="text-primary underline" href={`/resources/numbers/${account.phoneNumber.id}`}>{account.phoneNumber.number}</Link> : account.phone || "未填写"}</p>
        <p>直播间：{account.room ? <Link className="text-primary underline" href={`/resources/rooms/${account.room.id}`}>{account.room.name}</Link> : "未分配"}</p>
        <p>运营：{account.operator?.name ?? "无"} · 直播中控：{account.controller?.name ?? "无"} · 主播：{account.externalAnchor ? `${account.externalAnchor.name}（外部）` : account.anchor?.name ?? "无"}</p>
        <p>登录手机：{phones.length ? phones.map(phone => <Link key={phone.id} href={`/resources/phones/${phone.id}`} className="mr-3 text-primary underline">{phone.code}</Link>) : "未登记或无可见手机"}</p>
        <p>状态：{accountStatusLabel(account)}</p>
        <p className="break-words">用途：{account.purpose || "未填写"}</p>
        <p>{account.homepageUrl ? <a href={account.homepageUrl} target="_blank" rel="noopener noreferrer" className="text-primary">查看抖音主页 ↗</a> : "主页链接未填写"}</p>
        <p className="whitespace-pre-wrap break-words sm:col-span-2">备注：{account.notes || "未填写"}</p>
      </section>
      {canEdit && options && <section id="edit-duties" className="flex scroll-mt-24 flex-col gap-4">
        <h2 className="text-lg font-semibold">编辑资料与负责人</h2>
        <AccountForm key={account.version} {...options} initial={{
          externalAnchorId: account.externalAnchorId ?? "", phoneNumberId: account.phoneNumberId ?? "", roomId: account.roomId ?? "", id: account.id, version: account.version, douyinId: account.douyinId, name: account.name,
          homepageUrl: account.homepageUrl, realName: account.realName, phone: account.phone,
          purpose: account.purpose, notes: account.notes, branchId: account.branchId ?? "",
          operatorId: account.operatorId ?? "", controllerId: account.controllerId ?? "", anchorId: account.anchorId ?? "",
          active: account.banned ? "banned" : account.active ? "true" : "false", unbanDate: account.unbanDate ?? "",
        }} />
      </section>}
      {account.branch?.status === "INACTIVE" && <p className="text-sm text-muted-foreground">分公司已停用，重新启用后可维护账号。</p>}
    </> : <p className="text-sm text-muted-foreground">你已不负责此账号，仅可查看此前负责期间的历史，当前资料不可见。</p>}
    <section className="flex flex-col gap-4"><h2 className="text-lg font-semibold">历史记录</h2><AccountHistory records={history} /></section>
  </>;
}
