import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { requireAccountActor } from "@/modules/accounts/service";
import { canManageLiveReports } from "@/lib/auth/live-report-permissions";
import { writeAudit } from "@/lib/audit";
export const recycleSchema = z.object({ id: z.string().min(1), version: z.coerce.number().int().min(1), section: z.enum(["report", "monetization"]), operation: z.enum(["delete", "restore"]), confirmed: z.literal("yes"), reason: z.string().trim().min(1, "请填写操作原因").max(2000) });
export async function recycleLiveReport(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string) {
  const input = recycleSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  const report = await tx.liveReport.findUnique({ where: { id: input.id }, include: { branch: true, workSession: { select: { liveDataRole:true, deletedAt: true, leadTask: { select: { id: true,deletedAt:true,releasedAt:true } } } } } });
  if (!report || !canManageLiveReports(actor, report.branch)) throw new UserActionError("记录不存在或无操作权限");
  if (report.workSession?.deletedAt) throw new UserActionError("请先恢复关联场次");
  if (report.directTaskId || (report.workSession?.leadTask && !report.workSession.leadTask.releasedAt && !(report.workSession.liveDataRole === "CONTROLLER" && report.workSession.leadTask.deletedAt))) throw new UserActionError("请在导粉场次页面删除或恢复本场数据");
  if (report.version !== input.version) throw new UserActionError("数据已被修改，请刷新后重新核对");
  if (input.section === "monetization" && report.deletedAt) throw new UserActionError("请先恢复本场直播数据，再处理打粉数据");
  if (input.section === "monetization" && !report.monetizationUpdatedAt) throw new UserActionError("本场尚未填写打粉数据，无需删除");
  const field = input.section === "report" ? "deletedAt" : "monetizationDeletedAt";
  if ((input.operation === "delete") === !!report[field]) throw new UserActionError("记录状态已变化，请刷新后重试");
  const deletedAt = input.operation === "delete" ? new Date() : null;
  await tx.liveReport.update({ where: { id: report.id }, data: { [field]: deletedAt, updatedByName: actor.name, version: { increment: 1 } } });
  await writeAudit({ db: tx, actorId: actor.id, action: "LIVE_REPORT_UPDATE", targetType: "LiveReport", targetId: report.id, ip, detail: { actorName: actor.name, reason: input.reason, operation: input.operation, section: input.section, previousVersion: report.version, version: report.version + 1, before: report[field]?.toISOString() ?? null, after: deletedAt?.toISOString() ?? null } });
}
