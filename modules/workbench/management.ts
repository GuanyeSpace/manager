import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireAccountActor } from "@/modules/accounts/service";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { writeAudit } from "@/lib/audit";
import { shanghaiDate } from "@/modules/live-reports/schema";
import { assertSessionInterval } from "./corrections";
import { endOutcomes, isViolationEnd, isOtherEnd, completedCheckCount, type EquipmentChecks } from "./schema";
import type { Screenshot } from "./screenshots";

export async function requireSessionBoss(tx: Prisma.TransactionClient, token: string) {
  const actor = await requireAccountActor(tx, token);
  if (!isAccountBoss(actor)) throw new UserActionError("仅老板可以管理全部场次记录");
  return actor;
}
const supplementSchema = z.object({
  id: z.string().min(1).max(100), accountId: z.string().min(1), sourceRecordId: z.string().min(1),
  actualControllerId: z.string().min(1), label: z.string().trim().min(1).max(100),
  kind: z.enum(["complete", "unstarted"]), time: z.string(), endedAt: z.string().default(""),
  endKind: z.enum(["normal", "violation_stop", "violation_ban", "equipment", "other"]).default("normal"),
  reason: z.string().trim().min(1, "请填写补录原因").max(2000), note: z.string().trim().max(2000).default(""),
  failureReason: z.enum(["", "人脸验证未通过", "账号封禁", "设备故障", "主播原因", "其他"]).default(""),
});
export async function supplementSession(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string, screenshots: Screenshot[] = []) {
  const input = supplementSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireSessionBoss(tx, token);
  if (await tx.workSession.findUnique({ where: { id: input.id } })) throw new UserActionError("本次补录已提交，请返回场次列表查看，不要重复提交");
  const account = await tx.douyinAccount.findUnique({ where: { id: input.accountId } });
  const source = await tx.accountRecord.findFirst({ where: { id: input.sourceRecordId, accountId: input.accountId } });
  const person = await tx.user.findUnique({ where: { id: input.actualControllerId } });
  if (!account || !source || !source.branchId || !person) throw new UserActionError("请选择有效账号、历史归属及员工");
  const time = shanghaiDate(input.time), end = input.kind === "complete" ? shanghaiDate(input.endedAt) : null;
  if (!time || time.getTime() > Date.now() || input.kind === "complete" && (!end || end.getTime() > Date.now())) throw new UserActionError("请填写不晚于现在的北京时间");
  const matching = await tx.accountRecord.findMany({ where: { accountId: account.id, startedAt: { lte: time }, OR: [{ endedAt: null }, { endedAt: { gt: time } }] }, select: { id: true } });
  if (matching.length === 1 && matching[0].id !== source.id) throw new UserActionError("所选历史归属与本场时间不符，请选择对应时间的账号版本");
  const abnormal = input.kind === "unstarted" || input.endKind !== "normal";
  if (abnormal && (!input.note || !screenshots.length)) throw new UserActionError("未开播或异常下播必须填写具体原因并上传截图");
  if (input.kind === "unstarted" && !input.failureReason) throw new UserActionError("请选择未开播原因类型");
  if (!abnormal && screenshots.length) throw new UserActionError("正常下播无需上传异常截图");
  if (end) await assertSessionInterval(tx, { id: input.id, accountId: account.id, loginUserId: null, controllerId: person.id }, person.id, time, end);
  const outcome = input.kind === "unstarted" ? "UNSTARTED" : endOutcomes[input.endKind];
  const data = {
    id: input.id, accountId: account.id, sourceRecordId: source.id, controllerId: person.id,
    actualControllerId: person.id, actualControllerName: person.name, label: input.label,
    phase: input.kind === "complete" ? "COMPLETE" as const : "CANCELLED" as const,
    startedAt: end ? time : null, endedAt: end, occurredAt: time, outcome,
    supplementedAt: new Date(), supplementedById: actor.id, supplementedByName: actor.name,
    // 历史流程没有版本证据，明确留空，不复制今天的流程冒充当时执行。
    workflow: { before: [], live: [], after: [], scripts: [], materials: "" }, workflowVersion: 0,
    progress: {}, leadEligible: !!end, hasIncident: abnormal, hasViolation: isViolationEnd(outcome),
    hasOtherIncident: isOtherEnd(outcome), violationDetail: isViolationEnd(outcome) ? input.note : "", wrapNote: input.note,
  };
  const session = await tx.workSession.create({ data });
  const body = `老板补录 · ${input.reason}${input.failureReason ? ` · ${input.failureReason}` : ""}${input.note ? `：${input.note}` : ""}`;
  const event = await tx.workEvent.create({ data: { sessionId: session.id, kind: input.kind === "unstarted" ? "unstarted" : "supplement", actorId: actor.id, actorName: actor.name, body } });
  for (const file of screenshots) await tx.workScreenshot.create({ data: { ...file, sessionId: session.id, eventId: event.id, branchId: source.branchId } });
  await writeAudit({ db: tx, actorId: actor.id, action: "WORK_SESSION_UPDATE", targetType: "WorkSession", targetId: session.id, ip, detail: { command: "supplement", actorName: actor.name, reason: input.reason, before: null, after: { accountId: account.id, sourceRecordId: source.id, actualControllerId: person.id, label: input.label, time: time.toISOString(), endedAt: end?.toISOString() ?? null, outcome, note: input.note, failureReason: input.failureReason }, attributionExplicit: matching.length !== 1 } });
  return session.id;
}
const recycleSchema = z.object({ id: z.string().min(1), version: z.coerce.number().int().min(1), operation: z.enum(["delete", "restore"]), reason: z.string().trim().min(1, "请填写操作原因").max(2000) });
export async function recycleSession(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string) {
  const input = recycleSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireSessionBoss(tx, token);
  const session = await tx.workSession.findUnique({ where: { id: input.id }, include: { leadTask: true, report: true, shift: true } });
  if (!session) throw new UserActionError("场次不存在");
  if (session.version !== input.version) throw new UserActionError("场次已更新，请刷新后重试");
  if (!["COMPLETE", "CANCELLED"].includes(session.phase)) throw new UserActionError("请先结束并归档场次，再删除");
  const deleting = input.operation === "delete";
  if (deleting === !!session.deletedAt) throw new UserActionError("场次状态已变化，请刷新");
  if (deleting && (session.leadTask && !session.leadTask.deletedAt && !session.leadTask.releasedAt || session.report && !session.report.deletedAt)) throw new UserActionError("请先处理本场关联的导粉认领或报表，再删除场次");
  if (!deleting && session.shift && (session.createdAt < session.shift.startedAt || session.startedAt && session.startedAt < session.shift.startedAt || session.shift.endedAt && session.endedAt && session.endedAt > session.shift.endedAt)) throw new UserActionError("场次时间已不在关联上班范围内，请先核对上班记录后恢复");
  if (!deleting && session.startedAt && session.endedAt) await assertSessionInterval(tx, session, session.actualControllerId ?? session.controllerId, session.startedAt, session.endedAt);
  const deletedAt = deleting ? new Date() : null;
  await tx.workSession.update({ where: { id: session.id }, data: { deletedAt, deletedById: deleting ? actor.id : null, deleteReason: deleting ? input.reason : null, version: { increment: 1 } } });
  await tx.workEvent.create({ data: { sessionId: session.id, kind: input.operation, body: `${deleting ? "移入回收站" : "恢复场次"}：${input.reason}`, actorId: actor.id, actorName: actor.name } });
  await writeAudit({ db: tx, actorId: actor.id, action: "WORK_SESSION_UPDATE", targetType: "WorkSession", targetId: session.id, ip, detail: { command: input.operation, actorName: actor.name, reason: input.reason, before: session.deletedAt?.toISOString() ?? null, after: deletedAt?.toISOString() ?? null, version: session.version + 1 } });
  return session.id;
}
export type ManagementParams = { page?: string; pageSize?: string; accountId?: string; userId?: string; from?: string; to?: string; status?: string; trash?: string };
export function managementFilters(p: ManagementParams) {
  const page = Math.max(1, Math.min(100000, Math.trunc(Number(p.page) || 1))), pageSize = [10,20,50].includes(Number(p.pageSize)) ? Number(p.pageSize) : 20;
  const from = p.from ? shanghaiDate(`${p.from}T00:00`) : null, last = p.to ? shanghaiDate(`${p.to}T00:00`) : null;
  const to = last ? new Date(last.getTime() + 86400000) : null;
  return { page, pageSize, range: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } };
}
export async function readManagedSessions(tx: Prisma.TransactionClient, token: string, p: ManagementParams) {
  await requireSessionBoss(tx, token);
  const { page, pageSize, range } = managementFilters(p);
  const where: Prisma.WorkSessionWhereInput = { deletedAt: p.trash === "yes" ? { not: null } : null, ...(p.accountId ? { accountId: p.accountId } : {}), AND: [
    ...(p.userId ? [{ OR: [{ actualControllerId: p.userId }, { actualControllerId: null, controllerId: p.userId }] }] : []),
    ...(Object.keys(range).length ? [{ OR: [{ startedAt: range }, { startedAt: null, occurredAt: range }, { startedAt: null, occurredAt: null, createdAt: range }] }] : []),
  ] };
  if (["PREPARING","LIVE","WRAP","COMPLETE","CANCELLED"].includes(p.status ?? "")) where.phase = p.status as "COMPLETE";
  const rows = await tx.workSession.findMany({ where, include: { sourceRecord: true, leadTask: { select: { id: true, deletedAt: true, releasedAt: true } }, report: { select: { id: true, deletedAt: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: pageSize, skip: (page - 1) * pageSize });
  const accounts = await tx.douyinAccount.findMany({ select: { id: true, name: true, douyinId: true }, orderBy: { name: "asc" } });
  const people = await tx.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  return { rows, count: await tx.workSession.count({ where }), accounts, people, page, pageSize };
}
export function shiftCheckSummary(checks: EquipmentChecks) { return completedCheckCount(checks) < 4 ? "未完成" : Object.values(checks).some(c => c.status === "issue") ? "有异常" : "全部正常"; }
