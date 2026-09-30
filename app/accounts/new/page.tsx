import { redirect } from "next/navigation";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getAccountOptions } from "@/modules/accounts/queries";
import { AccountForm } from "@/components/account-form";

export default async function NewAccountPage() {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  const options = await getAccountOptions();
  if (!options.branches.length) redirect("/accounts");
  return <><h1 className="text-2xl font-semibold">新增抖音账号</h1><AccountForm {...options} /></>;
}
