import { getShift } from "@/modules/workbench/queries";
import { WorkShiftPanel } from "@/components/work-shift-panel";
export default async function AttendancePage() {
  const data = await getShift();
  return <><h1 className="text-2xl font-semibold">上班/下班</h1><p className="text-sm text-muted-foreground">登记到岗、检查设备，完成全部场次收尾后结束上班。</p><WorkShiftPanel {...data} /></>;
}
