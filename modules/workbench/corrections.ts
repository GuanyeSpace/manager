import { assertNoDirectDuplicate } from "@/modules/direct-leads/service";
import { requireSessionAnchor } from "./anchors";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import { formatDateTime } from "@/lib/datetime";
import { writeAudit } from "@/lib/audit";
import { requireAccountActor } from "@/modules/accounts/service";
import { shanghaiDate, shanghaiInput } from "@/modules/live-reports/schema";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { canExecute } from "./service";
import { endKindSchema, endKinds, endOutcomes, endKindForOutcome, isInterrupted, isViolationEnd, isOtherEnd, phases, phaseLabels, workflowSchema, type Progress } from "./schema";
import type { Screenshot } from "./screenshots";

export type CorrectionChange = { field: string; before: string; after: string };
export const correctionLabels = { anchor: "本场主播", times: "实际开播和下播时间", controller: "本场直播中控", task: "事项记录", violation: "违规情况", wrap: "收尾情况", evidence: "截图", unstarted: "未开播原因" };
const correctionSchema = z.object({
  id: z.string().min(1).max(100), version: z.coerce.number().int().min(1),
  kind: z.enum(["anchor", "times", "controller", "task", "violation", "wrap", "evidence", "unstarted"]),
  reason: z.string().trim().min(1, "请填写更正原因").max(2000),
  startedAt: z.string().max(30).default(""), endedAt: z.string().max(30).default(""),
  actualAnchorId: z.string().max(100).default(""),
  actualControllerId: z.string().max(100).default(""),
  phase: z.enum(phases).default("before"), index: z.coerce.number().int().min(0).max(39).default(0),
  status: z.enum(["done", "pending", "issue", "skip"]).default("done"),
  otherIncident: z.enum(["", "yes", "no"]).default(""),
  violation: z.enum(["", "yes", "no"]).default(""), incident: z.enum(["", "yes", "no"]).default(""),
  endKind: endKindSchema.default("normal"), note: z.string().trim().max(2000).default(""),
  failureReason: z.enum(["", "人脸验证未通过", "账号封禁", "设备故障", "主播原因", "其他"]).default(""),
  recoveryDate: z.string().max(10).default(""),
});

// 表单只显示到分钟；未改动的字段保留原始秒和毫秒，不因保存其他字段被截断。
export function correctedTime(value: string, previous: Date | null) {
  if (previous && value === shanghaiInput(previous)) return previous;
  const time = shanghaiDate(value);
  if (!time || time.getTime() > Date.now()) throw new UserActionError("请填写有效且不晚于现在的北京时间");
  return time;
}
export const minuteFloor = (date: Date) => Math.floor(date.getTime() / 60000) * 60000;

export async function assertSessionInterval(tx: Prisma.TransactionClient, session: { id: string; accountId: string; loginUserId: string | null; controllerId: string }, actualId: string, start: Date, end: Date) {
  await assertNoDirectDuplicate(tx,session.accountId,start);
  if (end <= start) throw new UserActionError("下播时间必须晚于开播时间");
  const people = [...new Set([session.loginUserId ?? session.controllerId, actualId])];
  const conflict = await tx.workSession.findFirst({ where: {
    deletedAt: null, id: { not: session.id }, startedAt: { lt: end },
    AND: [
      { OR: [{ endedAt: { gt: start } }, { phase: "LIVE", endedAt: null }] },
      { OR: [{ accountId: session.accountId }, { loginUserId: { in: people } }, { actualControllerId: { in: people } }, { loginUserId: null, controllerId: { in: people } }, { actualControllerId: null, controllerId: { in: people } }] },
    ],
  }, select: { id: true } });
  if (conflict) throw new UserActionError("更正后的时间或直播中控与其他直播场次重叠，请核对后重试");
}

export async function correctSession(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string, screenshots: Screenshot[] = []) {
  const input = correctionSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  const s = await tx.workSession.findUnique({ where: { id: input.id }, include: { account: true, sourceRecord: true, shift: true } });
  if (!s || s.deletedAt || !canExecute(actor, s.account, s.controllerId) || (s.loginUserId && s.loginUserId !== actor.id && !isAccountBoss(actor))) throw new UserActionError("场次不存在或无更正权限");
  if (input.kind !== "anchor" && !["COMPLETE", "CANCELLED"].includes(s.phase)) throw new UserActionError("请先完成本场收尾或未开播归档，再更正记录");
  if (s.version !== input.version) throw new UserActionError("本场记录已更新，请刷新后核对再更正");
  if (screenshots.length && !["violation", "wrap", "evidence", "unstarted"].includes(input.kind)) throw new UserActionError("此更正不需要上传截图");
  const workflow = workflowSchema.parse(s.workflow), progress = s.progress as Progress;
  const data: Prisma.WorkSessionUpdateInput = { version: { increment: 1 } };
  const before: Record<string, Prisma.InputJsonValue | null> = {}, after: Record<string, Prisma.InputJsonValue | null> = {};
  const changes: CorrectionChange[] = [];
  function change(field: string, label: string, oldValue: Prisma.InputJsonValue | null, newValue: Prisma.InputJsonValue | null, oldText: string, newText: string) {
    before[field] = oldValue; after[field] = newValue; changes.push({ field: label, before: oldText, after: newText });
  }
  if (input.kind === "anchor") {
    if (!isAccountBoss(actor)) throw new UserActionError("仅老板可以更正本场主播");
    const person = await requireSessionAnchor(tx, input.actualAnchorId, s.sourceRecord.branchId);
    if (person.id === (s.actualAnchorId ?? s.sourceRecord.anchorId)) throw new UserActionError("主播未发生变化");
    data.actualAnchor = { connect: { id: person.id } }; data.actualAnchorName = person.name;
    change("actualAnchorId", "本场实际主播", s.actualAnchorId ?? s.sourceRecord.anchorId, person.id, s.actualAnchorName ?? s.sourceRecord.anchorName ?? "未记录", person.name);
  } else if (input.kind === "times") {
    if (s.phase !== "COMPLETE" || !s.startedAt || !s.endedAt) throw new UserActionError("未开播场次不能填写开播和下播时间，请另建真实开播场次");
    const start = correctedTime(input.startedAt, s.startedAt), end = correctedTime(input.endedAt, s.endedAt);
    if (s.shift && (start.getTime() < minuteFloor(s.shift.startedAt) || s.shift.endedAt && minuteFloor(end) > s.shift.endedAt.getTime())) throw new UserActionError("直播时间必须在本次上班范围内，请先核对上班时间");
    await assertSessionInterval(tx, s, s.actualControllerId ?? s.controllerId, start, end);
    if (+start === +s.startedAt && +end === +s.endedAt) throw new UserActionError("时间未发生变化");
    data.startedAt = start; data.endedAt = end;
    change("startedAt", "实际开播", s.startedAt.toISOString(), start.toISOString(), formatDateTime(s.startedAt, true), formatDateTime(start, true));
    change("endedAt", "实际下播", s.endedAt.toISOString(), end.toISOString(), formatDateTime(s.endedAt, true), formatDateTime(end, true));
  } else if (input.kind === "controller") {
    if (input.actualControllerId === (s.actualControllerId ?? s.controllerId)) throw new UserActionError("本场直播中控未发生变化");
    const person = await tx.user.findFirst({ where: { id: input.actualControllerId, employmentStatus: "ACTIVE", OR: [{ branchId: s.sourceRecord.branchId }, ...(isAccountBoss(actor) ? [{ id: actor.id }] : [])] } });
    if (!person) throw new UserActionError("请选择本分公司在职员工");
    if (s.startedAt && s.endedAt) await assertSessionInterval(tx, s, person.id, s.startedAt, s.endedAt);
    data.actualControllerId = person.id; data.actualControllerName = person.name;
    change("actualControllerId", "本场直播中控", s.actualControllerId, person.id, s.actualControllerName ?? s.sourceRecord.controllerName ?? "未记录", person.name);
  } else if (input.kind === "task") {
    const task = workflow[input.phase][input.index], key = `${input.phase}:${input.index}`;
    if (!task || s.phase === "CANCELLED" && input.phase !== "before") throw new UserActionError("该事项不属于此场次已执行的阶段");
    if (["issue", "skip"].includes(input.status) && !input.note) throw new UserActionError("异常或不适用需要填写处理说明");
    const previous = progress[key];
    const next = { status: input.status, note: input.note, actor: previous?.status === input.status ? previous.actor : actor.name, at: previous?.status === input.status ? previous.at : new Date().toISOString() };
    data.progress = { ...progress, [key]: next };
    const names = { done: "完成", issue: "异常", skip: "不适用", pending: "待处理" };
    change(key, `${phaseLabels[input.phase]} · ${task.title}`, previous ?? null, next, previous ? `${names[previous.status]} · ${previous.note || "无备注"}` : "未处理", `${names[next.status]} · ${next.note || "无备注"}`);
    changes.push({ field: "事项原操作 / 本次状态时间", before: previous ? `${previous.actor} · ${formatDateTime(new Date(previous.at), true)}` : "未记录", after: `${next.actor} · ${formatDateTime(new Date(next.at), true)}` });
  } else if (input.kind === "violation") {
    if (s.phase !== "COMPLETE" || !input.violation) throw new UserActionError("请选择已开播场次是否违规");
    if (input.violation === "yes" && (!input.note || !screenshots.length)) throw new UserActionError("有违规时必须填写具体内容并上传截图");
    if (input.violation === "no" && screenshots.length) throw new UserActionError("无违规更正不需要截图，可通过补充截图入口上传说明图片");
    data.hasIncident = input.violation === "yes" || isInterrupted(s.outcome) ? true : s.hasOtherIncident === null ? s.hasIncident : s.hasOtherIncident;
    change("hasIncident", "本场异常", s.hasIncident, data.hasIncident, String(s.hasIncident), String(data.hasIncident));
    data.hasViolation = input.violation === "yes"; data.violationDetail = input.violation === "yes" ? input.note : "";
    change("hasViolation", "违规情况", s.hasViolation, data.hasViolation, s.hasViolation === null ? "历史未记录" : s.hasViolation ? "有违规" : "无违规", data.hasViolation ? "有违规" : "无违规");
    change("violationDetail", "违规内容", s.violationDetail, String(data.violationDetail), s.violationDetail || "—", String(data.violationDetail) || "—");
  } else if (input.kind === "wrap") {
    if (s.phase !== "COMPLETE" || !input.incident) throw new UserActionError("请选择已收尾场次有异常或无异常");
    if ((input.incident === "yes" || input.endKind !== "normal") && !input.note) throw new UserActionError("有异常或异常中断时必须填写具体情况");
    if (input.endKind !== "normal" && s.outcome !== endOutcomes[input.endKind] && !screenshots.length) throw new UserActionError("更正为异常中断必须上传截图");
    const violation = input.violation === "yes" || isViolationEnd(endOutcomes[input.endKind]), other = input.otherIncident === "yes" || isOtherEnd(endOutcomes[input.endKind]);
    if (input.incident === "yes" && !violation && !other) throw new UserActionError("请选择异常类型");
    if (input.incident === "no" && (violation || other || input.endKind !== "normal")) throw new UserActionError("违规或异常中断不能标记无异常");
    if (violation && !screenshots.length) throw new UserActionError("更正违规必须上传截图");
    data.hasViolation = violation; data.violationDetail = violation ? input.note : ""; data.hasOtherIncident = other;
    change("hasViolation", "违规", s.hasViolation, violation, String(s.hasViolation), String(violation));
    change("hasOtherIncident", "其他异常", s.hasOtherIncident, other, String(s.hasOtherIncident), String(other));
    change("violationDetail", "违规说明", s.violationDetail, String(data.violationDetail), s.violationDetail, String(data.violationDetail));
    data.hasIncident = input.incident === "yes"; data.wrapNote = input.note; data.outcome = endOutcomes[input.endKind];
    change("hasIncident", "收尾异常", s.hasIncident, data.hasIncident, s.hasIncident === null ? "历史未记录" : s.hasIncident ? "有异常" : "无异常", data.hasIncident ? "有异常" : "无异常");
    change("wrapNote", "收尾说明", s.wrapNote, input.note, s.wrapNote || "—", input.note || "—");
    change("outcome", "下播方式", s.outcome, String(data.outcome), endKinds[endKindForOutcome(s.outcome)], endKinds[input.endKind]);
  } else if (input.kind === "unstarted") {
    if (s.phase !== "CANCELLED" || !input.failureReason || !input.note) throw new UserActionError("请选择未开播类型并填写具体原因");
    if (input.recoveryDate && !shanghaiDate(`${input.recoveryDate}T00:00`)) throw new UserActionError("预计恢复日期无效");
    if (s.outcome !== "UNSTARTED" && !screenshots.length) throw new UserActionError("更正为未正常开播必须上传截图");
    const previous = await tx.workEvent.findFirst({ where: { sessionId: s.id, kind: { in: ["unstarted", "cancel"] } }, orderBy: { createdAt: "desc" } });
    const lastCorrection = await tx.auditLog.findFirst({ where: { targetType: "WorkSession", targetId: s.id, detail: { path: ["kind"], equals: "unstarted" } }, orderBy: { createdAt: "desc" } });
    const oldNote = (lastCorrection?.detail as { after?: { unstartedNote?: string } } | null)?.after?.unstartedNote ?? previous?.body ?? "历史未记录";
    data.outcome = "UNSTARTED";
    const note = `${input.failureReason}：${input.note}${input.recoveryDate ? ` · 预计恢复 ${input.recoveryDate}` : ""}`;
    change("unstartedNote", "未正常开播原因", oldNote, note, oldNote, note);
  } else if (!screenshots.length) throw new UserActionError("请上传需要补充或更正的截图，原截图会保留");
  if (screenshots.length) change("screenshots", "补充截图", null, screenshots.map(f => f.id), "原截图保留", `新增 ${screenshots.length} 张，见本次记录附件`);
  await tx.workSession.update({ where: { id: s.id }, data });
  const body = `更正${correctionLabels[input.kind]} · 原因：${input.reason}\n${changes.map(c => `${c.field}：${c.before} → ${c.after}`).join("\n")}`;
  const event = await tx.workEvent.create({ data: { sessionId: s.id, kind: `correct:${input.kind}`, body, actorId: actor.id, actorName: actor.name } });
  for (const file of screenshots) await tx.workScreenshot.create({ data: { ...file, sessionId: s.id, eventId: event.id, branchId: s.sourceRecord.branchId } });
  await writeAudit({ db: tx, actorId: actor.id, action: "WORK_SESSION_UPDATE", targetType: "WorkSession", targetId: s.id, detail: { command: "correct", kind: input.kind, reason: input.reason, actorName: actor.name, before, after, changes, version: s.version + 1 }, ip });
  return s.id;
}
