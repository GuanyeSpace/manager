import { liveFields, liveValues } from "@/modules/reporting/service";
import { requireReadAccountActor } from "@/lib/auth/read-actor";
import { directScope } from "@/modules/direct-leads/service";
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
function availableScope(actor: AccountActor): Prisma.WorkSessionWhereInput {
  return { ...eligible, AND: [{ OR: [{leadTask:null}, {leadTask:{releasedAt:{not:null},deletedAt:null}}] }, { OR: [{report:null},{liveDataRole:"CONTROLLER",report:{deletedAt:null}}] }], sourceRecord: { ...(isLeadSpecialist(actor) && isAccountBoss(actor) ? {} : {branchId:isLeadSpecialist(actor) ? actor.branchId ?? "" : ""}), branch:{status:"ACTIVE"} } };
}
export async function readLeadClaim(tx: Prisma.TransactionClient, token: string, id: string) {
  const actor = await requireReadAccountActor(tx, token);
  if (!isLeadSpecialist(actor)) return null;
  const session = await tx.workSession.findFirst({where:{AND:[availableScope(actor),{id}]},include:{sourceRecord:true}});
  if (!session) return null;
  const people = await tx.user.findMany({where:{branchId:session.sourceRecord.branchId,employmentStatus:"ACTIVE"},select:{id:true,name:true},orderBy:{name:"asc"}});
  return {session, people, defaultPersonId:people.some(p=>p.id===actor.id) ? actor.id : ""};
}
function claimSnapshot(task: {data: unknown;userId:string;userName:string;actualLeadId:string|null;actualLeadName:string|null;releasedAt:Date|null;version:number}) {
  return {data:task.data as Prisma.InputJsonValue,userId:task.userId,userName:task.userName,actualLeadId:task.actualLeadId,actualLeadName:task.actualLeadName,releasedAt:task.releasedAt?.toISOString() ?? null,version:task.version};
}
export async function readLeadList(tx: Prisma.TransactionClient, token: string, view: string, page = 1) {
  const actor = await requireReadAccountActor(tx, token);
  const specialist = isLeadSpecialist(actor);
  const manager = !!await tx.branch.findFirst({ where: reportManagementScope(actor), select: { id: true } }) || isAccountBoss(actor);
  const skip = (Math.max(1, Math.min(100000, page)) - 1) * 20;
  if (view === "available") {
    const where = availableScope(actor);
    const count = await tx.workSession.count({ where });
    const sessions = await tx.workSession.findMany({ where, select: { id: true, label: true, phase: true, startedAt: true, endedAt: true, sourceRecord: { select: { name: true, douyinId: true, anchorName: true, branchName: true } }, account: { select: { branchId: true, room: { select: { name: true } } } } }, orderBy: [{ startedAt: "desc" }, { id: "asc" }], take: 20, skip });
    return { specialist, manager, asOf: Date.now(), count, sessions: sessions.map(s => ({ ...s, account: { room: s.account.branchId === actor.branchId ? s.account.room : null } })), tasks: [] };
  }
  const where: Prisma.LeadTaskWhereInput = { releasedAt: null, AND: [leadScope(actor), view === "trash" ? { deletedAt: { not: null } } : { deletedAt: null, ...(view === "completed" ? { completedAt: { not: null } } : { completedAt: null }) }] };
  const tasks = await tx.leadTask.findMany({ where, select: { id: true, createdAt: true, userName: true, actualLeadName: true, completedAt: true, deletedAt: true, updatedAt: true, session: { select: { phase: true, label: true, startedAt: true, endedAt: true, sourceRecord: { select: { name: true, anchorName: true } } } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  const direct = await tx.directLeadTask.findMany({ where: { AND: [directScope(actor), view === "trash" ? {deletedAt:{not:null}} : {deletedAt:null,...(view === "completed" ? {completedAt:{not:null}} : {completedAt:null})}] }, select:{id:true,createdAt:true,userName:true,completedAt:true,deletedAt:true,updatedAt:true,label:true,startedAt:true,anchorName:true,sourceRecord:{select:{name:true}}} });
  const combined=[...tasks.map(t=>({...t,userName:t.actualLeadName??t.userName,direct:false})),...direct.map(t=>({id:t.id,createdAt:t.createdAt,userName:t.userName,completedAt:t.completedAt,deletedAt:t.deletedAt,updatedAt:t.updatedAt,direct:true,session:{phase:"COMPLETE" as const,label:t.label,startedAt:t.startedAt,endedAt:null,sourceRecord:{name:t.sourceRecord.name,anchorName:t.anchorName}}}))].sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()||a.id.localeCompare(b.id));
  return { specialist, manager, asOf: Date.now(), count: combined.length, sessions: [], tasks:combined.slice(skip,skip+20) };
}
export async function readLeadTask(tx: Prisma.TransactionClient, token: string, id: string) {
  const actor = await requireReadAccountActor(tx, token);
  const task = await tx.leadTask.findFirst({ where: { AND: [leadScope(actor), { id, releasedAt: null }] }, include: { branch: true, session: { include: { sourceRecord: true, report: { select: { deletedAt:true, longPressCount: true, hasSales: true, salesGmv: true } } } } } });
  if (!task) return null;
  const manager = canManageLiveReports(actor, task.branch);
  const editable = manager || isLeadSpecialist(actor) && actor.id === task.userId;
  const history = await tx.auditLog.findMany({ where: { targetType: "LeadTask", targetId: id }, orderBy: { createdAt: "desc" }, select: { id: true, detail: true, createdAt: true } });
  const people = manager ? await tx.user.findMany({ where: { employmentStatus: "ACTIVE", AND: [roleWhere("LEAD_SPECIALIST"), { OR: [{ branchId: task.branchId }, roleWhere("BOSS")] }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const actualPeople = manager ? await tx.user.findMany({where:{branchId:task.branchId,employmentStatus:"ACTIVE"},select:{id:true,name:true},orderBy:{name:"asc"}}) : [];
  return { task, manager, editable, history, people, actualPeople };
}
export async function runLeadCommand(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string) {
  const input = leadCommandSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  if (input.command === "claim") {
    if (!isLeadSpecialist(actor)) throw new UserActionError("仅导粉专员可以认领场次");
    const session = await tx.workSession.findFirst({ where: { ...eligible, id: input.id, sourceRecord: { ...(isAccountBoss(actor) ? {} : { branchId: actor.branchId ?? "" }), branch: { status: "ACTIVE" } } }, include: { leadTask: true, report: true, sourceRecord: true } });
    if (!session || !session.sourceRecord.branchId) throw new UserActionError("场次不存在或尚未实际开播，不能认领");
    if (session.leadTask && (!session.leadTask.releasedAt || session.leadTask.deletedAt)) throw new UserActionError(`本场已由${session.leadTask.userName}认领，请刷新列表`);
    if (session.report && (session.liveDataRole !== "CONTROLLER" || session.report.deletedAt)) throw new UserActionError("本场已有历史数据，请联系负责人维护");
    const person = await tx.user.findFirst({where:{id:input.actualLeadId || actor.id,branchId:session.sourceRecord.branchId,employmentStatus:"ACTIVE"}});
    if (!person) throw new UserActionError("请选择本分公司在职员工担任实际导粉专员");
    const fields = {userId:actor.id,userName:actor.name,actualLeadId:person.id,actualLeadName:person.name,releasedAt:null,data:{}};
    const task = session.leadTask
      ? await tx.leadTask.update({where:{id:session.leadTask.id},data:{...fields,version:{increment:1}}})
      : await tx.leadTask.create({data:{...fields,sessionId:session.id,branchId:session.sourceRecord.branchId}});
    await writeAudit({ db: tx, actorId: actor.id, action: "LIVE_REPORT_CREATE", targetType: "LeadTask", targetId: task.id, ip, detail: { command: "claim", actorName: actor.name, before: session.leadTask ? claimSnapshot(session.leadTask) : null, after:claimSnapshot(task), changes: [{ field: "本场实际导粉专员", before: "未认领", after: person.name }] } });
    return task.id;
  }
  const result = await readLeadTask(tx, token, input.id);
  if (!result || !result.editable) throw new UserActionError("记录不存在或无修改权限");
  const { task, manager } = result;
  if (task.session.deletedAt) throw new UserActionError("请先由老板恢复关联场次，再操作导粉数据");
  if (task.version !== input.version) throw new UserActionError("数据已被修改，请保留输入并刷新核对后重试");
  const changes: { field: string; before: string; after: string }[] = [];
  let data: Prisma.LeadTaskUncheckedUpdateInput = { version: { increment: 1 } };
  if (input.command === "release") {
    if (!isLeadSpecialist(actor) || task.userId !== actor.id) throw new UserActionError("只能撤销本人认领的场次");
    if (task.deletedAt || task.completedAt) throw new UserActionError("已删除或已提交完成的场次不能撤销");
    if (!input.reason) throw new UserActionError("请填写撤销原因");
    data.releasedAt = new Date();
    changes.push({field:"认领状态",before:"已认领",after:"已撤销，等待重新认领"});
  } else if (["correctOwner", "correctActual", "delete", "restore"].includes(input.command)) {
    if (!manager) throw new UserActionError("仅老板或本分公司负责人可以纠正认领及删除、恢复数据");
    if (!input.reason) throw new UserActionError("请填写操作原因");
    if (input.command === "correctActual") {
      if (task.deletedAt) throw new UserActionError("请先恢复数据");
      const person = await tx.user.findFirst({where:{id:input.actualLeadId,branchId:task.branchId,employmentStatus:"ACTIVE"}});
      if (!person || person.id === (task.actualLeadId ?? task.userId)) throw new UserActionError("请选择本分公司另一名在职员工");
      data.actualLeadId=person.id; data.actualLeadName=person.name;
      changes.push({field:"本场实际导粉专员",before:task.actualLeadName??task.userName,after:person.name});
    } else if (input.command === "correctOwner") {
      if (task.deletedAt) throw new UserActionError("请先恢复数据");
      const person = await tx.user.findFirst({ where: { id: input.userId, employmentStatus: "ACTIVE", AND: [roleWhere("LEAD_SPECIALIST"), { OR: [{ branchId: task.branchId }, roleWhere("BOSS")] }] } });
      if (!person || person.id === task.userId) throw new UserActionError("请选择本分公司另一名在职导粉专员");
      data = { ...data, actualLeadId:task.actualLeadId??task.userId, actualLeadName:task.actualLeadName??task.userName, userId: person.id, userName: person.name };
      changes.push({ field: "登录认领账号（误认领纠正）", before: task.userName, after: person.name });
    } else {
      const deleting = input.command === "delete";
      if(!deleting && task.session.liveDataRole === "CONTROLLER" && task.session.report?.deletedAt)throw new UserActionError("请先恢复本场直播数据");
      if (deleting === !!task.deletedAt) throw new UserActionError("记录状态已变化，请刷新核对");
      const deletedAt = deleting ? new Date() : null;
      data.deletedAt = deletedAt;
      await tx.liveReport.updateMany({ where: { workSessionId: task.sessionId }, data: { ...(task.session.liveDataRole === "CONTROLLER" ? {monetizationDeletedAt:deletedAt} : {deletedAt}), version: { increment: 1 }, updatedByName: actor.name } });
      changes.push({ field: "数据状态", before: deleting ? "正常" : "回收站", after: deleting ? "回收站" : "正常" });
    }
  } else {
    if (task.deletedAt) throw new UserActionError("数据已删除，请联系负责人恢复");
    if (!input.data) throw new UserActionError("请填写数据");
    if (task.completedAt && !input.reason) throw new UserActionError("请填写更正原因");
    const split=task.session.liveDataRole === "CONTROLLER";
    const values = split ? {...input.data,...liveValues(task.session.liveDataDraft)} : input.data, old = leadValues(task.data);
    const previousData = task.data as Record<string, Prisma.InputJsonValue>;
    if(values.leadMode === "no") for(const [key] of powderFields) if(values[key] === "") values[key] = old[key];
    for (const [key, label] of audienceFields) if (!split && old[key] !== "" && values[key] === "") throw new UserActionError(`${label}已有记录，不能清空`);
    for (const [key, label] of activeLeadFields) if ((!split || !liveFields.some(([k])=>k===key)) && values[key] !== old[key]) changes.push({ field: label, before: key === "leadMode" ? old[key] === "yes" ? "导粉" : old[key] === "no" ? "不导粉" : "未标记" : old[key] || "未填写", after: key === "leadMode" ? values[key] === "yes" ? "导粉" : values[key] === "no" ? "不导粉" : "未标记" : values[key] || "未填写" });
    if(old.leadMode && !values.leadMode) throw new UserActionError("已确认是否导粉，不能清空选择");
    const complete = input.command === "complete" || !!task.completedAt;
    if (complete) {
      if(split&&!task.session.liveDataSubmittedAt)throw new UserActionError("请等待直播中控提交直播数据，可先保存打粉草稿");
      const missing = activeLeadFields.filter(([key]) => values[key] === "" && !(values.leadMode === "no" && powderFields.some(([field])=>field === key)) && !(key === "leadMode" && task.completedAt && !old.leadMode) && !(task.completedAt && previousData.formVersion !== 2 && audienceFields.some(([field]) => field === key)));
      if (missing.length) throw new UserActionError(`请补齐：${missing.map(([, label]) => label).join("、")}`);
      const s = task.session, source = s.sourceRecord;
      if (!s.startedAt || !s.endedAt || !["WRAP", "COMPLETE"].includes(s.phase)) throw new UserActionError("请在本场实际下播后提交完成");
      const durationSeconds = parseDuration(values.durationText) ?? 0;
      if (!durationSeconds || s.startedAt.getTime() + durationSeconds * 1000 > Date.now()) throw new UserActionError("请核对直播时长：须大于0，且结束时间不能晚于现在");
      const metrics = Object.fromEntries([...metricFields, ...(values.leadMode === "no" ? [] : powderFields)].map(([key]) => [key, Number(values[key])])) as Record<typeof metricFields[number][0] | typeof powderFields[number][0], number>;
      const fields = { isLeadGeneration: values.leadMode === "" ? null : values.leadMode === "yes", ...metrics, femaleHundredths: audienceHundredths(values.femalePercent), age31To40Hundredths: audienceHundredths(values.age31To40Percent), durationSeconds, averageStayHundredths: Math.round(Number(values.averageStayMinutes) * 100), updatedByName: actor.name, monetizationUpdatedAt: new Date(), monetizationUpdatedBy: actor.name };
      await tx.liveReport.upsert({ where: { workSessionId: task.sessionId }, update: { ...(split ? {isLeadGeneration:fields.isLeadGeneration,...Object.fromEntries((values.leadMode === "no" ? [] : powderFields).map(([k])=>[k,Number(values[k])])),monetizationUpdatedAt:fields.monetizationUpdatedAt,monetizationUpdatedBy:actor.name,updatedByName:actor.name} : fields), version: { increment: 1 } }, create: { ...fields, workSessionId: task.sessionId, accountId: s.accountId, sourceRecordId: s.sourceRecordId, branchId: task.branchId, branchName: source.branchName, accountName: source.name, douyinId: source.douyinId, controllerId: source.controllerId, controllerName: source.controllerName, operatorId: source.operatorId, anchorId: source.anchorId, startedAt: s.startedAt, sessionLabel: s.label, createdById: actor.id, createdByName: actor.name } });
      if (!task.completedAt) { data.completedAt = new Date(); changes.push({ field: "填报状态", before: "待补数据", after: "已完成" }); }
    }
    if (!changes.length) throw new UserActionError("数据没有变化，无需保存");
    data.data = { ...previousData, ...Object.fromEntries(activeLeadFields.filter(([key])=>!split||!liveFields.some(([k])=>k===key)).map(([key]) => [key, values[key]])), ...(!task.completedAt && complete ? { formVersion: 2 } : {}) };
  }
  const after = await tx.leadTask.update({ where: { id: task.id }, data });
  await writeAudit({ db: tx, actorId: actor.id, action: "LIVE_REPORT_UPDATE", targetType: "LeadTask", targetId: task.id, ip, detail: { command: input.command, actorName: actor.name, reason: input.reason, version: after.version, before: { ...claimSnapshot(task), completedAt: task.completedAt?.toISOString() ?? null, deletedAt: task.deletedAt?.toISOString() ?? null }, after: { ...claimSnapshot(after), completedAt: after.completedAt?.toISOString() ?? null, deletedAt: after.deletedAt?.toISOString() ?? null }, changes } });
  return task.id;
}
