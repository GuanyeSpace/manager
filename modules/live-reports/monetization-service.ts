import type { Prisma } from "@/app/generated/prisma/client";
import { requireAccountActor } from "@/modules/accounts/service";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { canManageLiveReports } from "@/lib/auth/live-report-permissions";
import { writeAudit } from "@/lib/audit";
import { monetizationFields, monetizationSchema } from "./monetization-schema";

export async function saveMonetization(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string) {
  const input = monetizationSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  const before = await tx.liveReport.findUnique({ where: { id: input.id }, include: { branch: true, workSession: { select: { leadTask: { select: { id: true } } } } } });
  if (!before || !canManageLiveReports(actor, before.branch)) throw new UserActionError("记录不存在或无打粉数据填写权限");
  if (before.workSession?.leadTask) throw new UserActionError("请在导粉场次页面更正本场数据");
  if (before.monetizationUpdatedAt && !input.reason) throw new UserActionError("请填写更正原因");
  if (before.deletedAt || before.monetizationDeletedAt) throw new UserActionError("数据已删除，请先恢复后再填写");
  if (before.version !== Number(input.version)) throw new UserActionError("本场数据已被修改，请刷新后重新填写");
  const counts = Object.fromEntries(monetizationFields.map(([key]) => [key, input[key] === "" ? null : Number(input[key])])) as Record<typeof monetizationFields[number][0], number | null>;
  const data = { ...counts, hasSales: before.hasSales, salesGmv: before.salesGmv?.toFixed(2) ?? null };
  const report = await tx.liveReport.update({ where: { id: before.id }, data: {
    ...data, monetizationUpdatedAt: new Date(), monetizationUpdatedBy: actor.name, updatedByName: actor.name, version: { increment: 1 },
  } });
  await writeAudit({ db: tx, actorId: actor.id, action: "LIVE_REPORT_UPDATE", targetType: "LiveReport", targetId: report.id, ip,
    detail: { actorName: actor.name, reason: input.reason, section: "monetization", version: report.version,
      before: { ...Object.fromEntries(monetizationFields.map(([key]) => [key, before[key]])), hasSales: before.hasSales, salesGmv: before.salesGmv?.toFixed(2) ?? null }, after: data },
  });
  return report.id;
}
