import { powderFields } from "./input-metrics";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireAccountActor } from "@/modules/accounts/service";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { canManageLiveReports } from "@/lib/auth/live-report-permissions";
import { writeAudit } from "@/lib/audit";
import { monetizationSchema } from "./monetization-schema";

export async function saveMonetization(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string) {
  const input = monetizationSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  const before = await tx.liveReport.findUnique({ where: { id: input.id }, include: { branch: true, workSession: { select: { deletedAt: true, leadTask: { select: { id: true } } } } } });
  if (!before || !canManageLiveReports(actor, before.branch)) throw new UserActionError("记录不存在或无打粉数据填写权限");
  if (before.workSession?.deletedAt) throw new UserActionError("请先恢复关联场次");
  if (before.directTaskId || before.workSession?.leadTask) throw new UserActionError("请在导粉场次页面更正本场数据");
  if ((before.monetizationUpdatedAt || input.leadMode !== "") && !input.reason) throw new UserActionError("请填写更正原因");
  if (before.deletedAt || before.monetizationDeletedAt) throw new UserActionError("数据已删除，请先恢复后再填写");
  if (before.version !== Number(input.version)) throw new UserActionError("本场数据已被修改，请刷新后重新填写");
  if(before.isLeadGeneration !== null && !input.leadMode) throw new UserActionError("已确认是否导粉，不能清空选择");
  if(input.leadMode === "yes" && powderFields.some(([key])=>input[key] === "")) throw new UserActionError("导粉场次须补齐打粉数据");
  const counts = Object.fromEntries(powderFields.map(([key]) => [key, input.leadMode === "no" ? before[key] : input[key] === "" ? null : Number(input[key])])) as Record<typeof powderFields[number][0], number | null>;
  const data = { isLeadGeneration: input.leadMode === "" ? null : input.leadMode === "yes", ...counts, hasSales: before.hasSales, salesGmv: before.salesGmv?.toFixed(2) ?? null };
  const report = await tx.liveReport.update({ where: { id: before.id }, data: {
    ...data, monetizationUpdatedAt: new Date(), monetizationUpdatedBy: actor.name, updatedByName: actor.name, version: { increment: 1 },
  } });
  await writeAudit({ db: tx, actorId: actor.id, action: "LIVE_REPORT_UPDATE", targetType: "LiveReport", targetId: report.id, ip,
    detail: { actorName: actor.name, reason: input.reason, section: "monetization", version: report.version,
      before: { isLeadGeneration: before.isLeadGeneration, ...Object.fromEntries(powderFields.map(([key]) => [key, before[key]])), hasSales: before.hasSales, salesGmv: before.salesGmv?.toFixed(2) ?? null }, after: data },
  });
  return report.id;
}
