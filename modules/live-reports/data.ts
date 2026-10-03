import { requireReadAccountActor } from "@/lib/auth/read-actor";
import { hasRole } from "@/lib/auth/roles";
import { dateRange } from "./date-range";
import { reportPeople, reportPeopleInclude } from "./personnel";
import type { Prisma } from "@/app/generated/prisma/client";
import { isAccountBoss, type AccountActor } from "@/lib/auth/account-permissions";
import { canManageLiveReports, canViewLiveReports, isLeadSpecialist, isReportOperator, reportManagementScope } from "@/lib/auth/live-report-permissions";
import { reportFilterSchema, shanghaiDate, type ReportFilters } from "./schema";

export function liveReportScope(actor: AccountActor): Prisma.LiveReportWhereInput {
  if (!canViewLiveReports(actor)) return { id: { in: [] } };
  if (isAccountBoss(actor)) return {};
  return { OR: [{ branch: reportManagementScope(actor) }, ...(isLeadSpecialist(actor) ? [{ directTask: { userId: actor.id, branchId: actor.branchId ?? "" } }, { workSession: { leadTask: { releasedAt:null, userId: actor.id, branchId: actor.branchId ?? "" } } }] : []), ...(isReportOperator(actor) ? [{ branchId: actor.branchId ?? "", account: { operatorId: actor.id } }] : [])] };
}
export async function readReportAccountOptions(tx: Prisma.TransactionClient, token: string) {
  const actor = await requireReadAccountActor(tx, token);
  return tx.douyinAccount.findMany({
    where: { externalAnchorId: null, active: true, branch: { status: "ACTIVE" }, branchId: { not: "" }, AND: [{ branch: reportManagementScope(actor) }] },
    select: { id: true, name: true, douyinId: true }, orderBy: { createdAt: "asc" },
  });
}
export async function readLiveReports(tx: Prisma.TransactionClient, token: string, raw: ReportFilters) {
  const filters = reportFilterSchema.parse(raw);
  if(!filters.leadMode) filters.leadMode = filters.view === "monetization" ? "yes" : "all";
  const range = filters.preset ? dateRange(filters.preset) : null;
  if (range) Object.assign(filters, range);
  const actor = await requireReadAccountActor(tx, token);
  const scope = liveReportScope(actor);
  const recycled = filters.trash === "true";
  const visibility: Prisma.LiveReportWhereInput = recycled
    ? filters.view === "monetization" ? { OR: [{ deletedAt: { not: null } }, { monetizationDeletedAt: { not: null } }] } : { deletedAt: { not: null } }
    : { deletedAt: null, ...(filters.view === "monetization" ? { monetizationDeletedAt: null } : {}) };
  // Resolve historical personnel and corrected session times before filtering; never use current account staff.
  const all = (await tx.liveReport.findMany({ where: { AND: [scope, visibility, { OR: [{ workSessionId: null }, { workSession: { deletedAt: null } }] }] }, include: reportPeopleInclude })).map(reportPeople);
  const matches = all.filter(r => (filters.source === "all" || (filters.source === "direct" ? !!r.directTaskId : !r.directTaskId)) && (filters.view !== "monetization" || filters.leadMode === "all" || (filters.leadMode === "yes" ? r.isLeadGeneration !== false : filters.leadMode === "no" ? r.isLeadGeneration === false : r.isLeadGeneration === null)) && (!filters.accountId || r.accountId === filters.accountId) && (!filters.anchorId || (filters.anchorId === "unrecorded" ? !r.anchorId : r.anchorId === filters.anchorId)) && (!filters.controllerId || (filters.controllerId === "unrecorded" ? !r.controllerId : r.controllerId === filters.controllerId)) && (!filters.leadId || (filters.leadId === "unrecorded" ? !r.leadId : r.leadId === filters.leadId)) && (!filters.from || r.startedAt >= shanghaiDate(`${filters.from}T00:00`)!) && (!filters.to || r.startedAt < new Date(+shanghaiDate(`${filters.to}T00:00`)! + 86400000))).sort((a,b)=>+b.startedAt-+a.startedAt || a.id.localeCompare(b.id));
  const count = matches.length, pages = Math.max(1, Math.ceil(count / 30)), page = Math.min(filters.page, pages);
  const reports = matches.slice((page-1)*30,page*30).map(r => ({ ...r, canDelete: !r.directTaskId && (!r.workSession?.leadTask || !!r.workSession.leadTask.releasedAt) && canManageLiveReports(actor,r.branch), canDeleteMoney: !r.directTaskId && (!r.workSession?.leadTask || !!r.workSession.leadTask.releasedAt) && canManageLiveReports(actor,r.branch) }));
  const peopleOptions = (id: "anchorId"|"controllerId"|"leadId", name: "anchorName"|"controllerName"|"leadName") => [...new Map(all.filter(r=>r[id]).map(r=>[r[id]!, {id:r[id]!,name:r[name]}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
  const powderMatches = matches.filter(r=>r.isLeadGeneration !== false);
  const summary = { sessions: count, powderSessions: powderMatches.length, joins: powderMatches.reduce((n,r)=>n+(r.monetizationDeletedAt ? 0 : r.backendJoinCount ?? 0),0), effective: powderMatches.reduce((n,r)=>n+(r.monetizationDeletedAt ? 0 : r.effectiveCount ?? 0),0), incomplete: powderMatches.filter(r=>r.monetizationDeletedAt || r.backendJoinCount === null || r.effectiveCount === null).length };
  // 选择器也遵循权限：过去负责的账号显示历史名称，不读取交接后的当前资料。
  const historical = await tx.liveReport.findMany({ where: scope, distinct: ["accountId"],
    select: { accountId: true, accountName: true, douyinId: true }, orderBy: { startedAt: "desc" } });
  const current = await tx.douyinAccount.findMany({ where: isAccountBoss(actor) ? {} : { OR: [{ branch: reportManagementScope(actor) }, ...(isReportOperator(actor) ? [{ branchId: actor.branchId ?? "", operatorId: actor.id }] : [])] }, select: { id: true, name: true, douyinId: true } });
  const options = new Map(historical.map((r) => [r.accountId, { id: r.accountId, name: r.accountName, douyinId: r.douyinId }]));
  for (const account of current) options.set(account.id, account);
  const canCreate = (await readReportAccountOptions(tx, token)).length > 0;
  return { filters, summary, anchors: peopleOptions("anchorId","anchorName"), controllers: peopleOptions("controllerId","controllerName"), leads: peopleOptions("leadId","leadName"), reports, count, page, pages, accounts: [...options.values()], canCreate };
}
export async function readLiveReport(tx: Prisma.TransactionClient, token: string, id: string) {
  const actor = await requireReadAccountActor(tx, token);
  const report = await tx.liveReport.findFirst({ where: { AND: [liveReportScope(actor), { id }] }, include: reportPeopleInclude });
  if (!report) return null;
  const history = await tx.auditLog.findMany({ where: { targetType: "LiveReport", targetId: id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
  const people = isAccountBoss(actor) ? (await tx.user.findMany({select:{id:true,name:true,role:true,roles:true},orderBy:{name:"asc"}})).map(p=>({id:p.id,name:p.name,anchor:hasRole(p,"ANCHOR"),lead:hasRole(p,"LEAD_SPECIALIST")})) : [];
  return { people, report: reportPeople(report), history, directTaskId: report.directTaskId, leadTaskId: (report.workSession?.leadTask?.releasedAt || report.workSession?.liveDataRole === "CONTROLLER" && report.deletedAt) ? undefined : report.workSession?.leadTask?.id, canEdit: canManageLiveReports(actor, report.branch), canEditMonetization: !report.workSession?.leadTask?.releasedAt && canManageLiveReports(actor, report.branch) };
}
