import { notFound } from "next/navigation";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import { getShiftHistory } from "@/modules/workbench/queries";
import { WorkShiftDetail } from "@/components/work-shift-detail";
import { ReturnLink } from "@/components/context-link";
export default async function ShiftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser(); await requirePasswordChanged(user); if (!isAccountBoss(user)) notFound();
  const rows = await getShiftHistory(1, (await params).id); if (!rows.length) notFound();
  return <><ReturnLink fallback="/workbench/shifts" label="返回上班检查记录" /><h1 className="text-2xl font-semibold">上班检查详情</h1><WorkShiftDetail s={rows[0]} user={user} /></>;
}
