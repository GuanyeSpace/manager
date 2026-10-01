import { ManagedShiftList } from "@/components/managed-shift-list";
import type { ManagementParams } from "@/modules/workbench/management";
import { WorkShiftDetail } from "@/components/work-shift-detail";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import Link from "@/components/context-link";
import { requirePageUser, requirePasswordChanged } from "@/lib/auth/permissions";
import { getShiftHistory } from "@/modules/workbench/queries";

export default async function ShiftHistoryPage({ searchParams }: { searchParams: Promise<ManagementParams> }) {
  const user = await requirePageUser(); await requirePasswordChanged(user);
  const params = await searchParams, page = Math.max(1, Math.min(100000, Math.trunc(Number(params.page) || 1)));
  if (isAccountBoss(user)) return <ManagedShiftList params={params} />;
  const rows = await getShiftHistory(page);
  return <><h1 className="text-2xl font-semibold">上班与设备检查记录</h1><p className="text-sm text-muted-foreground">按一次上班查看，跨凌晨不拆分；历史场次未补建上班记录。</p>{rows.map(s => <WorkShiftDetail key={s.id} s={s} user={user} />)}{!rows.length && <p>暂无上班记录</p>}<nav className="flex gap-4 text-sm">{page > 1 && <Link href={`?page=${page - 1}`}>上一页</Link>}<span>第 {page} 页</span>{rows.length === 30 && <Link href={`?page=${page + 1}`}>下一页</Link>}</nav></>;
}
