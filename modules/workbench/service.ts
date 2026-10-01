import { correctSession } from "./corrections";
import type { Prisma } from "@/app/generated/prisma/client";
import { currentAccountScope, historicalAccountScope, requireAccountActor } from "@/modules/accounts/service";
import { isExecutionController, canManageAccountBranch, isAccountBoss, type AccountActor } from "@/lib/auth/account-permissions";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { writeAudit } from "@/lib/audit";
import { shanghaiDate, shanghaiInput } from "@/modules/live-reports/schema";
import { endKinds, endOutcomes, isInterrupted, isViolationEnd, isOtherEnd, copyWorkflowSchema, commandSchema, dailyTasks, workflowSchema, type Progress, type EquipmentChecks } from "./schema";

export function canEditWorkflow(actor: AccountActor, account: { branchId: string; controllerId: string | null; operatorId: string | null; branch: { id: string; managerId: string | null } }) {
  return !isExecutionController(actor) && (canManageAccountBranch(actor, account.branch) || (actor.branchId === account.branchId && account.operatorId === actor.id));
}
export function canEditScripts(actor: AccountActor, account: Parameters<typeof canEditWorkflow>[1]) {
  return canEditWorkflow(actor, account) || (actor.branchId === account.branchId && actor.id === account.controllerId);
}
export function canExecute(actor: AccountActor, account: { controllerId: string | null; branchId: string }, originalController = account.controllerId) {
  return isAccountBoss(actor) || (actor.id === account.controllerId && actor.id === originalController && actor.branchId === account.branchId);
}
export async function saveWorkflow(tx: Prisma.TransactionClient, token: string, accountId: string, version: number, raw: unknown, ip: string, scriptsOnly = false) {
  const submitted = scriptsOnly ? workflowSchema.shape.scripts.parse(raw) : workflowSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  const account = await tx.douyinAccount.findUnique({ where: { id: accountId }, include: { branch: true, workflow: true } });
  if (!account || !(scriptsOnly ? canEditScripts(actor, account) : canEditWorkflow(actor, account))) throw new UserActionError("无权维护此账号流程和话术");
  if ((account.workflow?.version ?? 0) !== version) throw new UserActionError("流程已被其他人修改，请刷新后重试");
  if (scriptsOnly && !account.workflow) throw new UserActionError("请先由老板、分公司负责人或运营配置流程");
  const content = scriptsOnly ? { ...workflowSchema.parse(account!.workflow!.content), scripts: submitted as import("./schema").Workflow["scripts"] } : { ...submitted as import("./schema").Workflow, materials: account.workflow ? workflowSchema.parse(account.workflow.content).materials : "" };
  const saved = await tx.accountWorkflow.upsert({ where: { accountId }, create: { accountId, content, updatedByName: actor.name }, update: { content, version: { increment: 1 }, updatedByName: actor.name } });
  await writeAudit({ db: tx, actorId: actor.id, action: "WORKFLOW_UPDATE", targetType: "AccountWorkflow", targetId: accountId, detail: { before: account.workflow?.content ?? null, after: content, version: saved.version }, ip });
}

export async function runWorkCommand(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string, screenshots: import("./screenshots").Screenshot[] = []) {
  const input = commandSchema.parse(raw);
  if (input.command === "correct") return correctSession(tx, token, raw, ip, screenshots);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  if (input.command === "create") {
    const account = await tx.douyinAccount.findUnique({ where: { id: input.id }, include: { branch: true, workflow: true } });
    if (!account || !canExecute(actor, account)) throw new UserActionError("仅负责直播中控或老板可以开始准备");
    if (!account.controllerId) throw new UserActionError("请先为直播账号绑定直播中控，再开始准备");
    if (account.banned) throw new UserActionError("账号已封禁，请确认解封并启用后再开始准备");
    if (!account.active || account.branch.status !== "ACTIVE" || !account.anchorId) throw new UserActionError("请先启用账号、分公司并绑定主播");
    if (!account.workflow) throw new UserActionError("请先保存账号流程");
    const shift = await tx.workShift.findFirst({ where: { userId: actor.id, endedAt: null } });
    if (!shift) throw new UserActionError("请先在工作台开始上班，再开始本场准备");
    const actual = await tx.user.findFirst({ where: { id: input.actualControllerId || actor.id, employmentStatus: "ACTIVE", OR: [{ branchId: account.branchId }, ...(isAccountBoss(actor) ? [{ id: actor.id }] : [])] }, select: { id: true, name: true } });
    if (!actual) throw new UserActionError("本场直播中控必须是本分公司在职员工");
    const existing = await tx.workSession.findFirst({ where: { accountId: account.id, phase: { in: ["PREPARING", "LIVE"] } } });
    if (existing) throw new UserActionError("此账号已有准备或直播中的场次，请先继续该场次");
    const source = await tx.accountRecord.findFirstOrThrow({ where: { accountId: account.id, endedAt: null } });
    const session = await tx.workSession.create({ data: { accountId: account.id, sourceRecordId: source.id, controllerId: account.controllerId, shiftId: shift.id, loginUserId: actor.id, loginUserName: actor.name, actualControllerId: actual.id, actualControllerName: actual.name, label: `${shanghaiInput(new Date()).replace("T", " ")} 场`, workflow: workflowSchema.parse(account.workflow.content), workflowVersion: account.workflow.version } });
    await writeAudit({ db: tx, actorId: actor.id, action: "WORK_SESSION_UPDATE", targetType: "WorkSession", targetId: session.id, detail: { command: "create", controllerId: account.controllerId }, ip });
    return session.id;
  }
  const session = await tx.workSession.findUnique({ where: { id: input.id }, include: { account: { include: { branch: true } }, sourceRecord: true } });
  if (!session || session.deletedAt || (!canExecute(actor, session.account, session.controllerId) || (session.loginUserId && session.loginUserId !== actor.id && !isAccountBoss(actor)))) throw new UserActionError("场次不存在或无执行权限");
  if (session.version !== input.version) throw new UserActionError("本场进度已更新，请刷新后重试");
  if (["COMPLETE", "CANCELLED"].includes(session.phase)) throw new UserActionError("场次已归档，不能继续修改执行记录");
  const workflow = workflowSchema.parse(session.workflow);
  const progress = session.progress as Progress;
  const needsScreenshots = input.command === "unstarted" || input.command === "end" && input.endKind !== "normal" || input.command === "violation" && input.violation === "yes";
  if (needsScreenshots && !screenshots.length) throw new UserActionError("请上传至少一张截图后提交");
  if (screenshots.length && !needsScreenshots && input.command !== "complete") throw new UserActionError("此操作不需要上传截图");
  const data: Prisma.WorkSessionUpdateInput = { version: { increment: 1 } };
  let body = input.note;
  if (input.command === "controller") {
    if (session.phase !== "PREPARING") throw new UserActionError("仅在开播前可以选择本场直播中控");
    const actual = await tx.user.findFirst({ where: { id: input.actualControllerId, employmentStatus: "ACTIVE", OR: [{ branchId: session.account.branchId }, ...(isAccountBoss(actor) ? [{ id: actor.id }] : [])] }, select: { id: true, name: true } });
    if (!actual) throw new UserActionError("本场直播中控必须是本分公司在职员工");
    data.actualControllerId = actual.id; data.actualControllerName = actual.name;
    body = `本场直播中控：${session.actualControllerName ?? session.sourceRecord.controllerName} → ${actual.name}`;
  } else if (["start", "end"].includes(input.command)) {
    const time = shanghaiDate(input.time);
    if (!time || time.getTime() > Date.now()) throw new UserActionError("请填写不晚于现在的实际时间（北京时间）");
    if (input.command === "start") {
      if (session.phase !== "PREPARING") throw new UserActionError("只有准备中的场次可以开播");
      if (session.account.banned) throw new UserActionError("账号已封禁，请确认解封并启用后再开播");
      if (!session.account.active || session.account.branch.status !== "ACTIVE") throw new UserActionError("账号或分公司已停用");
      // 输入精度为分钟；同一分钟建档和准备允许从该分钟起记。
      if (time < shanghaiDate(shanghaiInput(session.createdAt))! && !input.reason) throw new UserActionError("开播时间早于系统准备记录，请填写补填原因");
      if (session.shiftId) {
        const shift = await tx.workShift.findFirst({ where: { id: session.shiftId, endedAt: null } });
        const checks = shift?.checks as EquipmentChecks | undefined;
        if (!shift || ["sound", "picture", "network"].some(key => checks?.[key as keyof EquipmentChecks]?.status !== "normal")) throw new UserActionError("请先完成本次上班的声音、画面、网络检查并确认正常");
        if (time < shanghaiDate(shanghaiInput(shift.startedAt))!) throw new UserActionError("开播时间不能早于本次到岗时间");
      }
      if (session.actualControllerId) {
        const person = await tx.user.findFirst({ where: { id: session.actualControllerId, employmentStatus: "ACTIVE" } });
        if (!person || (person.branchId !== session.account.branchId && !(isAccountBoss(person) && person.id === session.loginUserId))) throw new UserActionError("本场直播中控已离职或调离，请重新选择");
      }
      const people = [...new Set([session.loginUserId ?? session.controllerId, session.actualControllerId ?? session.controllerId])];
      const conflict = await tx.workSession.findFirst({ where: { deletedAt: null, id: { not: session.id }, AND: [{ OR: [{ loginUserId: { in: people } }, { actualControllerId: { in: people } }, { loginUserId: null, controllerId: { in: people } }, { actualControllerId: null, controllerId: { in: people } }] }, { OR: [{ phase: "LIVE" }, { endedAt: { gt: time } }] }] } });
      if (conflict) throw new UserActionError("该直播中控已有直播中的场次，或填写时间与已有场次重叠");
      if (workflow.before.some((_, i) => progress[`before:${i}`]?.status !== "done")) throw new UserActionError("请先勾选完成全部开播前事项");
      data.phase = "LIVE"; data.startedAt = time;
    } else {
      if (session.phase !== "LIVE" || !session.startedAt || time <= session.startedAt) throw new UserActionError("下播时间须晚于开播时间，且场次正在直播中");
      if (input.endKind !== "normal" && !input.note) throw new UserActionError("异常中断必须填写原因");
      data.outcome = endOutcomes[input.endKind];
      data.phase = "WRAP"; data.endedAt = time;
      if (input.endKind !== "normal") { data.hasIncident = true; data.hasOtherIncident = isOtherEnd(endOutcomes[input.endKind]); data.wrapNote = input.note; if (isViolationEnd(endOutcomes[input.endKind])) { data.hasViolation = true; data.violationDetail = input.note; } }
    }
    body = `${input.time.replace("T", " ")}（北京时间）${input.note ? ` · ${input.note}` : ""}${input.reason ? ` · 补填原因：${input.reason}` : ""}`;
  } else if (input.command === "complete") {
    if (session.phase !== "WRAP") throw new UserActionError("请先确认下播");
    if (workflow.after.some((_, i) => progress[`after:${i}`]?.status !== "done")) throw new UserActionError("请先勾选完成全部下播后事项");
    if (!["yes", "no"].includes(input.incident)) throw new UserActionError("请选择本场有异常或无异常");
    const violation = input.violation === "yes", other = input.otherIncident === "yes";
    if (isInterrupted(session.outcome) && (input.incident !== "yes" || (isOtherEnd(session.outcome) && !other) || (isViolationEnd(session.outcome) && !violation))) throw new UserActionError("异常下播必须保留对应异常类型；误报请收尾后更正");
    if (session.hasViolation && !violation) throw new UserActionError("已有违规记录，请保留违规类型；误报请收尾后更正");
    if (input.incident === "yes" && (!input.note || (!violation && !other))) throw new UserActionError("请选择异常类型并填写具体原因");
    if (input.incident === "no" && (violation || other || screenshots.length)) throw new UserActionError("无异常不能提交异常类型或截图");
    const evidence = await tx.workScreenshot.count({ where: { sessionId: session.id, event: { kind: { in: ["end", "violation"] } } } });
    if (violation && !screenshots.length && !evidence) throw new UserActionError("违规必须上传至少一张截图");
    data.hasIncident = input.incident === "yes"; data.hasViolation = violation; data.hasOtherIncident = other;
    data.violationDetail = violation ? input.note : ""; data.wrapNote = input.incident === "yes" ? input.note : "";
    data.phase = "COMPLETE";
    body = input.incident === "yes" ? `完成收尾 · ${[violation ? "违规" : "", other ? "其他异常" : ""].filter(Boolean).join("、")}：${input.note}` : "完成收尾 · 无异常";
  } else if (input.command === "violation") {
    if (!["LIVE", "WRAP"].includes(session.phase)) throw new UserActionError("请在直播中或下播后填写违规情况");
    if (!["yes", "no"].includes(input.violation)) throw new UserActionError("请选择本场是否违规");
    if (input.violation === "yes" && !input.note) throw new UserActionError("请填写具体违规内容");
    data.hasViolation = input.violation === "yes";
    data.violationDetail = input.violation === "yes" ? input.note : "";
    body = input.violation === "yes" ? `本场有违规：${input.note}` : "本场无违规";
  } else if (input.command === "unstarted") {
    if (session.phase !== "PREPARING") throw new UserActionError("只有准备中的场次可以标记未正常开播");
    if (!input.failureReason || !input.note) throw new UserActionError("请选择未开播类型并填写具体原因");
    data.phase = "CANCELLED"; data.outcome = "UNSTARTED";
    body = `未正常开播 · ${input.failureReason}：${input.note}${input.recoveryDate ? ` · 预计恢复 ${input.recoveryDate}` : ""}`;
  } else if (input.command === "cancel") {
    if (session.phase !== "PREPARING" || !input.note) throw new UserActionError("仅能取消准备中的场次，请填写原因");
    data.phase = "CANCELLED";
  } else if (input.command === "check") {
    const requiredPhase = { before: "PREPARING", live: "LIVE", after: "WRAP" }[input.phase];
    if (session.phase !== requiredPhase || !workflow[input.phase][input.index]) throw new UserActionError("该事项不属于本场当前阶段");
    if (!["done", "pending"].includes(input.status)) throw new UserActionError("事项仅支持勾选完成或取消完成");
    const key = `${input.phase}:${input.index}`;
    data.progress = { ...progress, [key]: { status: input.status, note: progress[key]?.note ?? "", actor: progress[key]?.status === input.status ? progress[key].actor : actor.name, at: progress[key]?.status === input.status ? progress[key].at : new Date().toISOString() } };
    body = `${workflow[input.phase][input.index].title} · ${{ done: "完成", issue: "异常", skip: "不适用", pending: "取消完成" }[input.status]}${input.note ? ` · ${input.note}` : ""}`;
  } else {
    if (!input.note) throw new UserActionError("请填写检查结果或异常内容");
    if (input.command === "patrol" && session.phase !== "LIVE") throw new UserActionError("只有直播中可以记录巡检");
  }
  await tx.workSession.update({ where: { id: session.id }, data });
  const event = await tx.workEvent.create({ data: { sessionId: session.id, kind: input.command, body: input.command === "end" && input.endKind !== "normal" ? `${endKinds[input.endKind]} · ${body}` : body, actorId: actor.id, actorName: actor.name } });
  for (const screenshot of screenshots) await tx.workScreenshot.create({ data: { ...screenshot, branchId: session.sourceRecord.branchId, sessionId: session.id, eventId: event.id } });
  await writeAudit({ db: tx, actorId: actor.id, action: "WORK_SESSION_UPDATE", targetType: "WorkSession", targetId: session.id, detail: { command: input.command, beforePhase: session.phase, version: session.version + 1, body, ...(input.command === "check" ? { beforeProgress: progress, afterProgress: data.progress as Progress } : {}) }, ip });
  return session.id;
}

export async function saveDailyWork(tx: Prisma.TransactionClient, token: string, index: number, status: string, ip: string) {
  if (!Number.isInteger(index) || !dailyTasks[index] || !["done", "skip"].includes(status)) throw new UserActionError("日常事项无效");
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  const day = shanghaiInput(new Date()).slice(0, 10);
  const before = await tx.dailyWork.findUnique({ where: { userId_day: { userId: actor.id, day } } });
  const checks = { ...(before?.checks as Record<string, string> ?? {}), [index]: status };
  const saved = await tx.dailyWork.upsert({ where: { userId_day: { userId: actor.id, day } }, create: { userId: actor.id, day, checks }, update: { checks } });
  await writeAudit({ db: tx, actorId: actor.id, action: "DAILY_WORK_UPDATE", targetType: "DailyWork", targetId: saved.id, detail: { day, index, status }, ip });
}

export async function readWorkbench(tx: Prisma.TransactionClient, token: string) {
  const actor = await requireAccountActor(tx, token);
  const accounts = await tx.douyinAccount.findMany({ where: currentAccountScope(actor), select: { id: true, name: true, douyinId: true, active: true, banned: true, unbanDate: true, purpose: true, anchor: { select: { name: true } }, controller: { select: { name: true } }, branch: { select: { name: true } } }, orderBy: { name: "asc" } });
  const scope = { deletedAt: null, sourceRecord: historicalAccountScope(actor) };
  if (isExecutionController(actor)) {
    const sessions = await tx.workSession.findMany({ where: { ...scope, phase: { in: ["PREPARING", "LIVE", "WRAP"] } }, include: { sourceRecord: true }, orderBy: { createdAt: "desc" } });
    const daily = await tx.dailyWork.findUnique({ where: { userId_day: { userId: actor.id, day: shanghaiInput(new Date()).slice(0, 10) } } });
    return { accounts, sessions: sessions.map(s => ({ ...s, report: null })), daily, executionOnly: true };
  }
  const include = { sourceRecord: true, report: { select: { id: true, deletedAt: true, monetizationDeletedAt: true, fanGroupCount: true, linkClickCount: true, longPressCount: true, backendJoinCount: true, effectiveCount: true, hasSales: true, salesGmv: true } } } as const;
  const active = await tx.workSession.findMany({ where: { ...scope, phase: { in: ["PREPARING", "LIVE"] } }, include, orderBy: { createdAt: "desc" } });
  const pending = await tx.workSession.findMany({ where: { ...scope, phase: { in: ["WRAP", "COMPLETE"] }, OR: [{ phase: "WRAP" }, { report: { is: null } }, { report: { OR: [{ deletedAt: { not: null } }, { monetizationDeletedAt: { not: null } }, { fanGroupCount: null }, { linkClickCount: null }, { backendJoinCount: null }, { effectiveCount: null }] } }] }, include, orderBy: { createdAt: "desc" }, take: 50 });
  const sessions = [...active, ...pending];
  const daily = await tx.dailyWork.findUnique({ where: { userId_day: { userId: actor.id, day: shanghaiInput(new Date()).slice(0, 10) } } });
  return { accounts, sessions, daily, executionOnly: false };
}
export async function readWorkspace(tx: Prisma.TransactionClient, token: string, id: string) {
  const actor = await requireAccountActor(tx, token);
  const account = await tx.douyinAccount.findFirst({ where: { id, ...currentAccountScope(actor) }, select: { id: true, name: true, douyinId: true, purpose: true, room: { select: { id: true, name: true } }, phoneNumber: { select: { id: true, number: true } }, active: true, banned: true, unbanDate: true, branchId: true, controllerId: true, operatorId: true, anchorId: true, branch: { select: { id: true, name: true, managerId: true, status: true } }, controller: { select: { name: true } }, operator: { select: { name: true } }, anchor: { select: { name: true } }, workflow: true } });
  if (!account) return null;
  const current = await tx.workSession.findFirst({ where: { deletedAt: null, accountId: id, phase: { in: ["PREPARING", "LIVE"] }, sourceRecord: historicalAccountScope(actor) } });
  const wrapping = await tx.workSession.findMany({ where: { deletedAt: null, accountId: id, phase: "WRAP", sourceRecord: historicalAccountScope(actor) }, select: { id: true, label: true, endedAt: true }, orderBy: { createdAt: "desc" } });
  const controllers = await tx.user.findMany({ where: { branchId: account.branchId, employmentStatus: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return { account, current, wrapping, controllers, editable: canEditWorkflow(actor, account), scriptsEditable: canEditScripts(actor, account), executable: canExecute(actor, account) };
}
export async function readWorkSession(tx: Prisma.TransactionClient, token: string, id: string) {
  const actor = await requireAccountActor(tx, token);
  const session = await tx.workSession.findFirst({ where: { id, ...(!isAccountBoss(actor) ? { deletedAt: null } : {}), sourceRecord: historicalAccountScope(actor) }, include: { sourceRecord: true, screenshots: { orderBy: { createdAt: "asc" }, select: { id: true, createdAt: true, event: { select: { body: true, kind: true } } } }, report: { select: { id: true } }, events: { orderBy: { createdAt: "desc" }, take: 200, include: { screenshots: { select: { id: true }, orderBy: { createdAt: "asc" } } } }, account: { select: { controllerId: true, branchId: true, workflow: { select: { version: true } } } } } });
  if (!session) return null;
  const editable = !session.deletedAt && canExecute(actor, session.account, session.controllerId) && (!session.loginUserId || session.loginUserId === actor.id || isAccountBoss(actor));
  // 接手后的当前归属不传给旧负责人。
  const { account: _account, ...safe } = session;
  void _account;
  const controllers = editable && ["PREPARING", "COMPLETE", "CANCELLED"].includes(session.phase) ? await tx.user.findMany({ where: { branchId: session.sourceRecord.branchId, employmentStatus: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const corrections = await tx.auditLog.findMany({ where: { targetType: "WorkSession", targetId: id, detail: { path: ["command"], equals: "correct" } }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, detail: true } });
  return { corrections, session: { ...safe, report: isExecutionController(actor) ? null : safe.report }, editable, controllers, accountWorkflowVersion: session.account.workflow?.version ?? 0 };
}
export async function readWorkHistory(tx: Prisma.TransactionClient, token: string, page: number) {
  const actor = await requireAccountActor(tx, token);
  const sessions = await tx.workSession.findMany({ where: { deletedAt: null, sourceRecord: historicalAccountScope(actor) }, include: { sourceRecord: true, screenshots: { orderBy: { createdAt: "asc" }, select: { id: true, createdAt: true, event: { select: { body: true, kind: true } } } }, report: { select: { id: true } } }, orderBy: { createdAt: "desc" }, take: 30, skip: (page - 1) * 30 });
  return sessions.map(s => ({ ...s, report: isExecutionController(actor) ? null : s.report }));
}

export async function readConfigAccounts(tx: Prisma.TransactionClient, token: string) {
  const actor = await requireAccountActor(tx, token);
  const accounts = await tx.douyinAccount.findMany({ where: currentAccountScope(actor), include: { branch: true, workflow: { select: { version: true } } }, orderBy: { name: "asc" } });
  return accounts.filter(a => canEditWorkflow(actor, a)).map(a => ({ id: a.id, name: a.name, douyinId: a.douyinId, branchName: a.branch.name, version: a.workflow?.version }));
}

export async function copyWorkflow(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string) {
  const input = copyWorkflowSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  const accounts = await tx.douyinAccount.findMany({ where: { id: { in: [input.sourceId, ...input.targets.map(t => t.id)] } }, include: { branch: true, workflow: true } });
  if (accounts.length !== input.targets.length + 1 || accounts.some(a => !canEditWorkflow(actor, a))) throw new UserActionError("来源或目标账号不存在，或无配置权限");
  const source = accounts.find(a => a.id === input.sourceId)!;
  if (!source.workflow || source.workflow.version !== input.sourceVersion) throw new UserActionError("来源配置已变化，请刷新后重新选择");
  const content = workflowSchema.parse(source.workflow.content);
  // 先校验全部目标，再原子写入；任一账号冲突时不覆盖其他账号。
  for (const target of input.targets) {
    const a = accounts.find(a => a.id === target.id)!;
    if ((a.workflow?.version ?? 0) !== target.version) throw new UserActionError("目标配置已变化，请刷新后重新选择");
    if (!a.workflow && !["before", "live", "after"].every(part => input.parts.includes(part as typeof input.parts[number]))) throw new UserActionError("未配置的账号首次复制须包含三个阶段流程");
  }
  for (const target of input.targets) {
    const a = accounts.find(a => a.id === target.id)!;
    const merged = { ...(a.workflow ? workflowSchema.parse(a.workflow.content) : { before: [], live: [], after: [], scripts: [], materials: "" }), ...Object.fromEntries(input.parts.map(part => [part, content[part]])) };
    await saveWorkflow(tx, token, a.id, target.version, merged, ip);
    await writeAudit({ db: tx, actorId: actor.id, action: "WORKFLOW_UPDATE", targetType: "AccountWorkflow", targetId: a.id, detail: { operation: "copy", sourceAccountId: source.id, sourceVersion: input.sourceVersion, parts: input.parts }, ip });
  }
  return input.targets.length;
}
