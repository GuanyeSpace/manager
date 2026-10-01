import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import { getSupplementChoices } from "@/modules/workbench/queries";
import { ReturnLink } from "@/components/context-link";
import { SessionSupplementForm } from "@/components/session-management-form";
export default async function NewSessionPage() {
  const user = await requirePageUser(); await requirePasswordChanged(user); if (!isAccountBoss(user)) notFound();
  const choices = await getSupplementChoices();
  return <><ReturnLink fallback="/workbench/history" label="返回场次记录" /><h1 className="text-2xl font-semibold">补录历史场次</h1><p className="text-sm text-muted-foreground">仅补录已经结束或未正常开播的场次，记录补录人及原因，不建立上班记录。</p><div className="max-w-4xl rounded-xl border p-5"><SessionSupplementForm id={randomUUID()} {...choices} /></div></>;
}
