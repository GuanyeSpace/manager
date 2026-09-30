import { correctedTime, minuteFloor, type CorrectionChange } from "./corrections";
import { formatDateTime } from "@/lib/datetime";
import type { Prisma } from "@/app/generated/prisma/client";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import { requireAccountActor } from "@/modules/accounts/service";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { writeAudit } from "@/lib/audit";
import { equipmentLabels, shiftCommandSchema, type EquipmentChecks } from "./schema";

export async function readShift(tx: Prisma.TransactionClient, token: string) {
  const actor = await requireAccountActor(tx, token);
  const shift = await tx.workShift.findFirst({ where: { userId: actor.id, endedAt: null } });
  const first = shift ? await tx.workSession.findFirst({ where: { shiftId: shift.id, startedAt: { not: null } }, orderBy: { startedAt: "asc" }, select: { startedAt: true } }) : null;
  const unfinished = await tx.workSession.count({ where: { phase: { in: ["PREPARING", "LIVE", "WRAP"] }, OR: [{ loginUserId: actor.id }, { loginUserId: null, controllerId: actor.id }] } });
  return { shift, firstStartedAt: first?.startedAt ?? null, unfinished };
}

export async function runShiftCommand(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string) {
  const input = shiftCommandSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  if (input.command === "shiftStart") {
    if (!isAccountBoss(actor) && !await tx.douyinAccount.findFirst({ where: { controllerId: actor.id, branchId: actor.branchId ?? "" } })) throw new UserActionError("请先分配负责的直播账号");
    if (await tx.workShift.findFirst({ where: { userId: actor.id, endedAt: null } })) throw new UserActionError("已有进行中的上班记录，请继续本次上班");
    const startedAt = input.startedAt ? correctedTime(input.startedAt, null) : new Date();
    if (input.startedAt && !input.reason) throw new UserActionError("补填到岗时间必须填写原因");
    await assertShiftInterval(tx, actor.id, "", startedAt, null);
    const shift = await tx.workShift.create({ data: { startedAt, userId: actor.id, userName: actor.name, branchId: actor.branchId } });
    await writeAudit({ db: tx, actorId: actor.id, action: "DAILY_WORK_UPDATE", targetType: "WorkShift", targetId: shift.id, detail: { command: input.command, startedAt: shift.startedAt.toISOString(), reason: input.reason, actorName: actor.name }, ip });
    return shift.id;
  }
  const correcting = input.command === "shiftCorrectTime" || input.command === "shiftCorrectCheck";
  const shift = await tx.workShift.findFirst({ where: { id: input.id, ...(!isAccountBoss(actor) || !correcting ? { userId: actor.id } : {}), ...(!correcting ? { endedAt: null } : {}) } });
  if (!shift) throw new UserActionError("本次上班不存在或已结束");
  if (shift.version !== input.version) throw new UserActionError("上班记录已更新，请刷新后重试");
  if (correcting) {
    if (!input.reason) throw new UserActionError("请填写更正原因");
    const changes: CorrectionChange[] = [];
    let before: Prisma.InputJsonValue, after: Prisma.InputJsonValue;
    if (input.command === "shiftCorrectTime") {
      const start = correctedTime(input.startedAt, shift.startedAt);
      const end = shift.endedAt ? correctedTime(input.endedAt, shift.endedAt) : null;
      if (!shift.endedAt && input.endedAt) throw new UserActionError("尚未结束上班，请先按正常流程处理全部场次后结束上班");
      if (+start === +shift.startedAt && (end?.getTime() ?? null) === (shift.endedAt?.getTime() ?? null)) throw new UserActionError("上班时间未发生变化");
      await assertShiftInterval(tx, shift.userId, shift.id, start, end);
      const sessions = await tx.workSession.findMany({ where: { shiftId: shift.id }, select: { id: true, createdAt: true, startedAt: true, endedAt: true, phase: true } });
      if (sessions.some(s => minuteFloor(start) > Math.min(s.createdAt.getTime(), s.startedAt?.getTime() ?? Infinity))) throw new UserActionError("到岗时间不能晚于本次上班的准备或开播时间");
      if (end) {
        if (sessions.some(s => ["PREPARING", "LIVE", "WRAP"].includes(s.phase))) throw new UserActionError("本次上班仍有未收尾场次");
        const lastFinish = await tx.workEvent.findFirst({ where: { sessionId: { in: sessions.map(s => s.id) }, kind: { in: ["complete", "unstarted", "cancel"] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
        const last = Math.max(0, ...sessions.map(s => (s.endedAt ?? s.createdAt).getTime()), lastFinish?.createdAt.getTime() ?? 0);
        if (end.getTime() < Math.floor(last / 60000) * 60000) throw new UserActionError("结束上班时间不能早于本次场次下播和收尾完成时间");
      }
      before = { startedAt: shift.startedAt.toISOString(), endedAt: shift.endedAt?.toISOString() ?? null };
      after = { startedAt: start.toISOString(), endedAt: end?.toISOString() ?? null };
      changes.push({ field: "到岗时间", before: formatDateTime(shift.startedAt, true), after: formatDateTime(start, true) });
      if (end && shift.endedAt) changes.push({ field: "结束上班", before: formatDateTime(shift.endedAt, true), after: formatDateTime(end, true) });
      await tx.workShift.update({ where: { id: shift.id }, data: { startedAt: start, endedAt: end, version: { increment: 1 } } });
    } else {
      if (input.status === "issue" && !input.note) throw new UserActionError("设备异常必须填写原因");
      const checks = shift.checks as EquipmentChecks, old = checks[input.item];
      const next = { status: input.status, note: input.note, at: old?.at ?? new Date().toISOString(), actor: old?.actor ?? actor.name };
      before = { item: input.item, result: old ?? null }; after = { item: input.item, result: next };
      changes.push({ field: equipmentLabels[input.item], before: old ? `${old.status === "normal" ? "正常" : "异常"} · ${old.note || "无备注"}` : "未检查", after: `${next.status === "normal" ? "正常" : "异常"} · ${next.note || "无备注"}` });
      await tx.workShift.update({ where: { id: shift.id }, data: { checks: { ...checks, [input.item]: next }, version: { increment: 1 } } });
    }
    await writeAudit({ db: tx, actorId: actor.id, action: "DAILY_WORK_UPDATE", targetType: "WorkShift", targetId: shift.id, detail: { command: input.command, reason: input.reason, actorName: actor.name, before, after, changes, version: shift.version + 1 }, ip });
  } else if (input.command === "shiftEnd") {
    const { unfinished } = await readShift(tx, token);
    if (unfinished) throw new UserActionError("还有准备中、直播中或待收尾场次，请全部处理后结束上班");
    const endedAt = new Date();
    await tx.workShift.update({ where: { id: shift.id }, data: { endedAt, version: { increment: 1 } } });
    await writeAudit({ db: tx, actorId: actor.id, action: "DAILY_WORK_UPDATE", targetType: "WorkShift", targetId: shift.id, detail: { command: input.command, endedAt: endedAt.toISOString() }, ip });
  } else {
    if (input.status === "issue" && !input.note) throw new UserActionError("设备异常必须填写原因");
    const before = shift.checks as EquipmentChecks;
    const result = { status: input.status, note: input.note, at: new Date().toISOString(), actor: actor.name };
    await tx.workShift.update({ where: { id: shift.id }, data: { checks: { ...before, [input.item]: result }, version: { increment: 1 } } });
    await writeAudit({ db: tx, actorId: actor.id, action: "DAILY_WORK_UPDATE", targetType: "WorkShift", targetId: shift.id, detail: { command: input.command, item: equipmentLabels[input.item], before: before[input.item] ?? null, after: result }, ip });
  }
  return shift.id;
}

export async function readShiftHistory(tx: Prisma.TransactionClient, token: string, page: number) {
  const actor = await requireAccountActor(tx, token);
  const rows = await tx.workShift.findMany({ where: isAccountBoss(actor) ? {} : { userId: actor.id }, orderBy: [{ startedAt: "desc" }, { id: "asc" }], take: 30, skip: (page - 1) * 30, include: { sessions: { select: { id: true, label: true, startedAt: true, phase: true, outcome: true, actualControllerName: true }, orderBy: { createdAt: "asc" } } } });
  const changes = await tx.auditLog.findMany({ where: { targetType: "WorkShift", targetId: { in: rows.map(s => s.id) } }, orderBy: { createdAt: "asc" }, select: { id: true, targetId: true, createdAt: true, detail: true } });
  return rows.map(s => ({ ...s, changes: changes.filter(c => c.targetId === s.id) }));
}


async function assertShiftInterval(tx: Prisma.TransactionClient, userId: string, id: string, start: Date, end: Date | null) {
  if (end && end <= start) throw new UserActionError("结束上班时间必须晚于到岗时间");
  const other = await tx.workShift.findFirst({ where: { userId, id: { not: id }, startedAt: { lt: end ?? new Date() }, OR: [{ endedAt: { gt: start } }, { endedAt: null }] }, select: { id: true } });
  if (other) throw new UserActionError("上班时间与本人另一条上班记录重叠，请核对");
}
