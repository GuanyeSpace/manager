import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { listAccountHistory } from "@/modules/accounts/queries";
import { AccountHistory } from "@/components/account-history";

export default async function AccountHistoryPage() {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  const records = await listAccountHistory();
  return <><h1 className="text-2xl font-semibold">账号历史记录</h1>
    <p className="text-sm text-muted-foreground">保留变更前的归属、人员和账号名称，不展示实名人、手机号等敏感资料。</p>
    <AccountHistory records={records} />
  </>;
}
