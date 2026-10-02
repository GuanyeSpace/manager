import { anchorKey } from "@/lib/anchor-identity";
import type { Prisma } from "@/app/generated/prisma/client";
export const reportPeopleInclude = { sourceRecord: true, branch: true, directTask: { select: { userId: true, userName: true, deletedAt: true, completedAt: true } }, workSession: { select: { startedAt: true, actualAnchorId: true, actualAnchorName: true, actualControllerId: true, actualControllerName: true, sourceRecord: {select: {anchorId:true,anchorName:true}}, leadTask: { select: { id: true, userId: true, userName: true, deletedAt: true, completedAt: true } } } } } satisfies Prisma.LiveReportInclude;
type Row = Prisma.LiveReportGetPayload<{include: typeof reportPeopleInclude}>;
export function reportPeople(r: Row) {
  const s = r.workSession;
  return { ...r, originalStartedAt: r.startedAt, startedAt: s?.startedAt ?? r.startedAt,
    anchorId: anchorKey(s?.actualAnchorId ?? s?.sourceRecord.anchorId ?? r.anchorId,r.externalAnchorId),
    anchorName: r.externalAnchorId ? `${r.anchorName ?? r.sourceRecord.externalAnchorName ?? "未记录"}（外部）` : s?.actualAnchorName ?? s?.sourceRecord.anchorName ?? r.anchorName ?? r.sourceRecord.anchorName ?? "未记录",
    controllerId: s?.actualControllerId ?? r.controllerId,
    controllerName: r.directTaskId ? "未安排" : s?.actualControllerName ?? r.controllerName ?? "未记录",
    leadId: r.directTask?.userId ?? s?.leadTask?.userId ?? r.leadUserId, leadName: r.directTask?.userName ?? s?.leadTask?.userName ?? r.leadUserName ?? "未记录" };
}
