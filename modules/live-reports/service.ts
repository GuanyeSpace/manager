import { audienceHundredths, parseDuration } from "./input-metrics";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireAccountActor } from "@/modules/accounts/service";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { canManageLiveReports } from "@/lib/auth/live-report-permissions";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import { writeAudit } from "@/lib/audit";
import { reportSchema, shanghaiDate } from "./schema";

export async function saveLiveReport(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string) {
  const input = reportSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  const before = input.id ? await tx.liveReport.findUnique({ where: { id: input.id }, include: { branch: true, workSession: { select: { deletedAt: true, leadTask: { select: { id: true } } } } } }) : null;
  if (input.id && (!before || !canManageLiveReports(actor, before.branch))) throw new UserActionError("记录不存在或无修改权限");
  if (before?.workSession?.deletedAt) throw new UserActionError("请先恢复关联场次");
  if (before?.workSession?.leadTask) throw new UserActionError("请在导粉场次页面更正本场数据");
  if (before && !input.reason) throw new UserActionError("请填写更正原因");
  if (before?.deletedAt) throw new UserActionError("该记录已删除，请先在回收站恢复");
  if (before && before.version !== Number(input.version)) throw new UserActionError("数据已被修改，请刷新后重新填写");
  // 身份信息固定，纠错仅调整指标，避免把历史数据移动到另一个账号或时间段。
  if (before && (before.accountId !== input.accountId || before.startedAt.getTime() !== shanghaiDate(input.startedAt)!.getTime())) {
    throw new UserActionError("账号和开播时间保存后不可修改，请核对原记录");
  }
  const account = await tx.douyinAccount.findUnique({ where: { id: input.accountId }, include: { branch: true } });
  if (!account || !canManageLiveReports(actor, before?.branch ?? account.branch)) throw new UserActionError("仅老板或所属分公司负责人可维护历史数据");
  if (!before && (!account.active || account.branch.status !== "ACTIVE")) throw new UserActionError("账号或分公司已停用，不能新增数据");
  const startedAt = shanghaiDate(input.startedAt)!;
  if (!before && await tx.liveReport.findFirst({ where: { accountId: account.id, startedAt, deletedAt: { not: null } }, select: { id: true } })) throw new UserActionError("该场记录已在回收站，请先恢复原记录再修改");
  if (!before && !input.workSessionId && await tx.workSession.findFirst({ where: { deletedAt: null, accountId: account.id, leadEligible: true, startedAt: { gte: startedAt, lt: new Date(startedAt.getTime() + 60000) } }, select: { id: true } })) throw new UserActionError("本场请通过导粉工作台认领和填写，避免重复录入");
  const durationSeconds = input.durationText !== undefined ? parseDuration(input.durationText)! : Number(input.durationHours) * 3600 + Number(input.durationMinutes) * 60 + Number(input.durationSeconds);
  if ((!before || before.femaleHundredths !== null) && input.femalePercent === "" || (!before || before.age31To40Hundredths !== null) && input.age31To40Percent === "") throw new UserActionError("请填写女性比例和31–40岁比例；已有画像不能清空");
  if (startedAt.getTime() + durationSeconds * 1000 > Date.now()) throw new UserActionError("请在直播结束后录入，开播时间加直播时长不能晚于现在");
  const work = input.workSessionId ? await tx.workSession.findUnique({ where: { id: input.workSessionId }, include: { sourceRecord: true, report: { select: { id: true } } } }) : null;
  if (input.workSessionId && (!work || work.deletedAt || work.accountId !== account.id || !["WRAP", "COMPLETE"].includes(work.phase) || !work.startedAt || work.startedAt.getTime() !== startedAt.getTime())) throw new UserActionError("所选工作场次与账号、开播时间或状态不符");
  if (work?.leadEligible) throw new UserActionError("请先由导粉专员认领本场，再在导粉工作台填写");
  if (work?.report && work.report.id !== before?.id) throw new UserActionError("本场已有直播数据，请打开原记录修改");
  if (before && input.workSessionId && before.workSessionId !== input.workSessionId) throw new UserActionError("不能修改记录关联的工作场次");
  let source = before ? await tx.accountRecord.findUnique({ where: { id: before.sourceRecordId } }) : await tx.accountRecord.findFirst({
    where: { accountId: account.id, startedAt: { lte: startedAt }, OR: [{ endedAt: null }, { endedAt: { gt: startedAt } }] },
    orderBy: { version: "desc" },
  });
  if (!before && work) source = work.sourceRecord;
  let historicalBackfill = before?.historicalBackfill ?? false;
  if (!source) {
    const first = await tx.accountRecord.findFirst({ where: { accountId: account.id }, orderBy: { version: "asc" } });
    if (!first || startedAt >= first.startedAt) throw new UserActionError("无法确定当场归属，请联系老板核对账号历史");
    if (!isAccountBoss(actor) || input.confirmBackfill !== "true") throw new UserActionError("开播时间早于账号建档，请由老板确认按建档时归属补录");
    source = first;
    historicalBackfill = true;
  }
  if (!canManageLiveReports(actor, { id: source.branchId, managerId: (await tx.branch.findUnique({ where: { id: source.branchId } }))?.managerId ?? null })) throw new UserActionError("这场直播不属于你的负责期间，请由老板核对补录");
  const data = {
    femaleHundredths: audienceHundredths(input.femalePercent), age31To40Hundredths: audienceHundredths(input.age31To40Percent),
    durationSeconds, sessionLabel: input.sessionLabel, exposureCount: Number(input.exposureCount), entryCount: Number(input.entryCount),
    averageOnline: Number(input.averageOnline), peakOnline: Number(input.peakOnline),
    averageStayHundredths: Math.round(Number(input.averageStayMinutes) * 100),
    commenterCount: Number(input.commenterCount), likeCount: Number(input.likeCount), newFollowers: Number(input.newFollowers),
    shareCount: Number(input.shareCount), newFanClubMembers: Number(input.newFanClubMembers), updatedByName: actor.name,
  };
  const report = before ? await tx.liveReport.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } }) : await tx.liveReport.create({ data: {
    ...data, workSessionId: work?.id, accountId: account.id, sourceRecordId: source.id, branchId: source.branchId, branchName: source.branchName,
    accountName: source.name, douyinId: source.douyinId, controllerId: source.controllerId, controllerName: source.controllerName,
    operatorId: source.operatorId, anchorId: source.anchorId, createdById: actor.id, createdByName: actor.name, startedAt, historicalBackfill,
  } });
  const previousMetrics = before ? Object.fromEntries(Object.keys(data).map((key) => [key, before[key as keyof typeof data]])) : null;
  await writeAudit({ db: tx, actorId: actor.id, action: before ? "LIVE_REPORT_UPDATE" : "LIVE_REPORT_CREATE", targetType: "LiveReport", targetId: report.id,
    detail: { actorName: actor.name, reason: input.reason, accountId: account.id, startedAt: startedAt.toISOString(), version: report.version, before: previousMetrics, after: data, historicalBackfill }, ip });
  return report.id;
}
