import { audienceFields, audienceHundredths, parseDuration, powderFields } from "@/modules/live-reports/input-metrics";
import { metricFields } from "@/modules/live-reports/schema";
import { roleWhere } from "@/lib/auth/roles";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireAccountActor } from "@/modules/accounts/service";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { canManageLiveReports, isLeadSpecialist, isReportOperator, reportManagementScope } from "@/lib/auth/live-report-permissions";
import { isAccountBoss, type AccountActor } from "@/lib/auth/account-permissions";
import { writeAudit } from "@/lib/audit";
import { leadCommandSchema, activeLeadFields, leadValues } from "./schema";

export function leadScope(actor: AccountActor): Prisma.LeadTaskWhereInput {
  if (isAccountBoss(actor)) return {};
  return { OR: [{ branch: reportManagementScope(actor) }, ...(isLeadSpecialist(actor) ? [{ userId: actor.id, branchId: actor.branchId ?? "" }] : []), ...(isReportOperator(actor) ? [{ branchId: actor.branchId ?? "", session: { account: { operatorId: actor.id } } }] : [])] };
}
const eligible = { deletedAt: null, leadEligible: true, startedAt: { not: null }, phase: { in: ["LIVE", "WRAP", "COMPLETE"] as ("LIVE" | "WRAP" | "COMPLETE")[] } };
export async function readLeadList(tx: Prisma.TransactionClient, token: string, view: string, page = 1) {
  const actor = await requireAccountActor(tx, token);
  const specialist = isLeadSpecialist(actor);
  const manager = !!await tx.branch.findFirst({ where: reportManagementScope(actor), select: { id: true } }) || isAccountBoss(actor);
  const skip = (Math.max(1, Math.min(100000, page)) - 1) * 20;
  if (view === "available") {
    const where: Prisma.WorkSessionWhereInput = { ...eligible, leadTask: null, report: null, sourceRecord: { ...(specialist && isAccountBoss(actor) ? {} : { branchId: specialist ? actor.branchId ?? "" : "" }), branch: { status: "ACTIVE" } } };
    const count = await tx.workSession.count({ where });
    const sessions = await tx.workSession.findMany({ where, select: { id: true, label: true, phase: true, startedAt: true, endedAt: true, sourceRecord: { select: { name: true, douyinId: true, anchorName: true, branchName: true } }, account: { select: { branchId: true, room: { select: { name: true } } } } }, orderBy: [{ startedAt: "desc" }, { id: "asc" }], take: 20, skip });
    return { specialist, manager, asOf: Date.now(), count, sessions: sessions.map(s => ({ ...s, account: { room: s.account.branchId === actor.branchId ? s.account.room : null } })), tasks: [] };
  }
  const where: Prisma.LeadTaskWhereInput = { AND: [leadScope(actor), view === "trash" ? { deletedAt: { not: null } } : { deletedAt: null, ...(view === "completed" ? { completedAt: { not: null } } : { completedAt: null }) }] };
  const tasks = await tx.leadTask.findMany({ where, select: { id: true, userName: true, completedAt: true, deletedAt: true, updatedAt: true, session: { select: { phase: true, label: true, startedAt: true, endedAt: true, sourceRecord: { select: { name: true, anchorName: true } } } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 20, skip });
  return { specialist, manager, asOf: Date.now(), count: await tx.leadTask.count({ where }), sessions: [], tasks };
}
export async function readLeadTask(tx: Prisma.TransactionClient, token: string, id: string) {
  const actor = await requireAccountActor(tx, token);
  const task = await tx.leadTask.findFirst({ where: { AND: [leadScope(actor), { id }] }, include: { branch: true, session: { include: { sourceRecord: true, report: { select: { longPressCount: true, hasSales: true, salesGmv: true } } } } } });
  if (!task) return null;
  const manager = canManageLiveReports(actor, task.branch);
  const editable = manager || isLeadSpecialist(actor) && actor.id === task.userId;
  const history = await tx.auditLog.findMany({ where: { targetType: "LeadTask", targetId: id }, orderBy: { createdAt: "desc" }, select: { id: true, detail: true, createdAt: true } });
  const people = manager ? await tx.user.findMany({ where: { employmentStatus: "ACTIVE", AND: [roleWhere("LEAD_SPECIALIST"), { OR: [{ branchId: task.branchId }, roleWhere("BOSS")] }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  return { task, manager, editable, history, people };
}
export async function runLeadCommand(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string) {
  const input = leadCommandSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  if (input.command === "claim") {
    if (!isLeadSpecialist(actor)) throw new UserActionError("仅导粉专员可以认领场次");
    const session = await tx.workSession.findFirst({ where: { ...eligible, id: input.id, sourceRecord: { ...(isAccountBoss(actor) ? {} : { branchId: actor.branchId ?? "" }), branch: { status: "ACTIVE" } } }, include: { leadTask: true, report: true, sourceRecord: true } });
    if (!session) throw new UserActionError("场次不存在或尚未实际开播，不能认领");
    if (session.leadTask) throw new UserActionError(`本场已由${session.leadTask.userName}认领，请刷新列表`);
    if (session.report) throw new UserActionError("本场已有历史数据，请联系负责人维护");
    const task = await tx.leadTask.create({ data: { sessionId: session.id, branchId: session.sourceRecord.branchId, userId: actor.id, userName: actor.name } });
    await writeAudit({ db: tx, actorId: actor.id, action: "LIVE_REPORT_CREATE", targetType: "LeadTask", targetId: task.id, ip, detail: { command: "claim", actorName: actor.name, before: null, after: { userId: actor.id, userName: actor.name }, changes: [{ field: "本场导粉专员", before: "未认领", after: actor.name }] } });
    return task.id;
  }
  const result = await readLeadTask(tx, token, input.id);
  if (!result || !result.editable) throw new UserActionError("记录不存在或无修改权限");
  const { task, manager } = result;
  if (task.session.deletedAt) throw new UserActionError("请先由老板恢复关联场次，再操作导粉数据");
  if (task.version !== input.version) throw new UserActionError("数据已被修改，请保留输入并刷新核对后重试");
  const changes: { field: string; before: string; after: string }[] = [];
  let data: Prisma.LeadTaskUncheckedUpdateInput = { version: { increment: 1 } };
  if (["correctOwner", "delete", "restore"].includes(input.command)) {
    if (!manager) throw new UserActionError("仅老板或本分公司负责人可以纠正认领及删除、恢复数据");
    if (!input.reason) throw new UserActionError("请填写操作原因");
    if (input.command === "correctOwner") {
      if (task.deletedAt) throw new UserActionError("请先恢复数据");
      const person = await tx.user.findFirst({ where: { id: input.userId, employmentStatus: "ACTIVE", AND: [roleWhere("LEAD_SPECIALIST"), { OR: [{ branchId: task.branchId }, roleWhere("BOSS")] }] } });
      if (!person || person.id === task.userId) throw new UserActionError("请选择本分公司另一名在职导粉专员");
      data = { ...data, userId: person.id, userName: person.name };
      changes.push({ field: "本场导粉专员（误认领纠正）", before: task.userName, after: person.name });
    } else {
      const deleting = input.command === "delete";
      if (deleting === !!task.deletedAt) throw new UserActionError("记录状态已变化，请刷新核对");
      const deletedAt = deleting ? new Date() : null;
      data.deletedAt = deletedAt;
      await tx.liveReport.updateMany({ where: { workSessionId: task.sessionId }, data: { deletedAt, version: { increment: 1 }, updatedByName: actor.name } });
      changes.push({ field: "数据状态", before: deleting ? "正常" : "回收站", after: deleting ? "回收站" : "正常" });
    }
  } else {
    if (task.deletedAt) throw new UserActionError("数据已删除，请联系负责人恢复");
    if (!input.data) throw new UserActionError("请填写数据");
    if (task.completedAt && !input.reason) throw new UserActionError("请填写更正原因");
    const values = input.data, old = leadValues(task.data);
    const previousData = task.data as Record<string, Prisma.InputJsonValue>;
    if(values.leadMode === "no") for(const [key] of powderFields) if(values[key] === "") values[key] = old[key];
    for (const [key, label] of audienceFields) if (old[key] !== "" && values[key] === "") throw new UserActionError(`${label}已有记录，不能清空`);
    for (const [key, label] of activeLeadFields) if (values[key] !== old[key]) changes.push({ field: label, before: key === "leadMode" ? old[key] === "yes" ? "导粉" : old[key] === "no" ? "不导粉" : "未标记" : old[key] || "未填写", after: key === "leadMode" ? values[key] === "yes" ? "导粉" : values[key] === "no" ? "不导粉" : "未标记" : values[key] || "未填写" });
    if(old.leadMode && !values.leadMode) throw new UserActionError("已确认是否导粉，不能清空选择");
    const complete = input.command === "complete" || !!task.completedAt;
    if (complete) {
      const missing = activeLeadFields.filter(([key]) => values[key] === "" && !(values.leadMode === "no" && powderFields.some(([field])=>field === key)) && !(key === "leadMode" && task.completedAt && !old.leadMode) && !(task.completedAt && previousData.formVersion !== 2 && audienceFields.some(([field]) => field === key)));
      if (missing.length) throw new UserActionError(`请补齐：${missing.map(([, label]) => label).join("、")}`);
      const s = task.session, source = s.sourceRecord;
      if (!s.startedAt || !s.endedAt || !["WRAP", "COMPLETE"].includes(s.phase)) throw new UserActionError("请在本场实际下播后提交完成");
      const durationSeconds = parseDuration(values.durationText) ?? 0;
      if (!durationSeconds || s.startedAt.getTime() + durationSeconds * 1000 > Date.now()) throw new UserActionError("请核对直播时长：须大于0，且结束时间不能晚于现在");
      const metrics = Object.fromEntries([...metricFields, ...(values.leadMode === "no" ? [] : powderFields)].map(([key]) => [key, Number(values[key])])) as Record<typeof metricFields[number][0] | typeof powderFields[number][0], number>;
      const fields = { isLeadGeneration: values.leadMode === "" ? null : values.leadMode === "yes", ...metrics, femaleHundredths: audienceHundredths(values.femalePercent), age31To40Hundredths: audienceHundredths(values.age31To40Percent), durationSeconds, averageStayHundredths: Math.round(Number(values.averageStayMinutes) * 100), updatedByName: actor.name, monetizationUpdatedAt: new Date(), monetizationUpdatedBy: actor.name };
      await tx.liveReport.upsert({ where: { workSessionId: task.sessionId }, update: { ...fields, version: { increment: 1 } }, create: { ...fields, workSessionId: task.sessionId, accountId: s.accountId, sourceRecordId: s.sourceRecordId, branchId: task.branchId, branchName: source.branchName, accountName: source.name, douyinId: source.douyinId, controllerId: source.controllerId, controllerName: source.controllerName, operatorId: source.operatorId, anchorId: source.anchorId, startedAt: s.startedAt, sessionLabel: s.label, createdById: actor.id, createdByName: actor.name } });
      if (!task.completedAt) { data.completedAt = new Date(); changes.push({ field: "填报状态", before: "待补数据", after: "已完成" }); }
    }
    if (!changes.length) throw new UserActionError("数据没有变化，无需保存");
    data.data = { ...previousData, ...Object.fromEntries(activeLeadFields.map(([key]) => [key, values[key]])), ...(!task.completedAt && complete ? { formVersion: 2 } : {}) };
  }
  const after = await tx.leadTask.update({ where: { id: task.id }, data });
  await writeAudit({ db: tx, actorId: actor.id, action: "LIVE_REPORT_UPDATE", targetType: "LeadTask", targetId: task.id, ip, detail: { command: input.command, actorName: actor.name, reason: input.reason, version: after.version, before: { data: task.data, userId: task.userId, completedAt: task.completedAt?.toISOString() ?? null, deletedAt: task.deletedAt?.toISOString() ?? null }, after: { data: after.data, userId: after.userId, completedAt: after.completedAt?.toISOString() ?? null, deletedAt: after.deletedAt?.toISOString() ?? null }, changes } });
  return task.id;
}
