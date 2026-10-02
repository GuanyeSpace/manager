import type { Prisma } from "@/app/generated/prisma/client";
export const reportPeopleInclude = { sourceRecord: true, branch: true, workSession: { select: { startedAt: true, actualAnchorId: true, actualAnchorName: true, actualControllerId: true, actualControllerName: true, sourceRecord: {select: {anchorId:true,anchorName:true}}, leadTask: { select: { id: true, userId: true, userName: true, deletedAt: true, completedAt: true } } } } } satisfies Prisma.LiveReportInclude;
type Row = Prisma.LiveReportGetPayload<{include: typeof reportPeopleInclude}>;
export function reportPeople(r: Row) {
  const s = r.workSession;
  return { ...r, originalStartedAt: r.startedAt, startedAt: s?.startedAt ?? r.startedAt,
    anchorId: s?.actualAnchorId ?? s?.sourceRecord.anchorId ?? r.anchorId,
    anchorName: s?.actualAnchorName ?? s?.sourceRecord.anchorName ?? r.anchorName ?? r.sourceRecord.anchorName ?? "未记录",
    controllerId: s?.actualControllerId ?? r.controllerId,
    controllerName: s?.actualControllerName ?? r.controllerName ?? "未记录",
    leadId: s?.leadTask?.userId ?? r.leadUserId, leadName: s?.leadTask?.userName ?? r.leadUserName ?? "未记录" };
}
