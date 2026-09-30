import type { Prisma } from "@/app/generated/prisma/client";
import { requireAccountActor } from "@/modules/accounts/service";
import { isAccountBoss, type AccountActor } from "@/lib/auth/account-permissions";
import { canManageLiveReports, canViewLiveReports, isLeadSpecialist, isReportOperator, reportManagementScope } from "@/lib/auth/live-report-permissions";
import { reportFilterSchema, shanghaiDate, type ReportFilters } from "./schema";

export function liveReportScope(actor: AccountActor): Prisma.LiveReportWhereInput {
  if (!canViewLiveReports(actor)) return { id: { in: [] } };
  if (isAccountBoss(actor)) return {};
  return { OR: [{ branch: reportManagementScope(actor) }, ...(isLeadSpecialist(actor) ? [{ workSession: { leadTask: { userId: actor.id, branchId: actor.branchId ?? "" } } }] : []), ...(isReportOperator(actor) ? [{ branchId: actor.branchId ?? "", account: { operatorId: actor.id } }] : [])] };
}
export async function readReportAccountOptions(tx: Prisma.TransactionClient, token: string) {
  const actor = await requireAccountActor(tx, token);
  return tx.douyinAccount.findMany({
    where: { active: true, branch: { status: "ACTIVE" }, branchId: { not: "" }, AND: [{ branch: reportManagementScope(actor) }] },
    select: { id: true, name: true, douyinId: true }, orderBy: { createdAt: "asc" },
  });
}
export async function readLiveReports(tx: Prisma.TransactionClient, token: string, raw: ReportFilters) {
  const filters = reportFilterSchema.parse(raw);
  const actor = await requireAccountActor(tx, token);
  const scope = liveReportScope(actor);
  const recycled = filters.trash === "true";
  const visibility: Prisma.LiveReportWhereInput = recycled
    ? filters.view === "monetization" ? { OR: [{ deletedAt: { not: null } }, { monetizationDeletedAt: { not: null } }] } : { deletedAt: { not: null } }
    : { deletedAt: null, ...(filters.view === "monetization" ? { monetizationDeletedAt: null } : {}) };
  const where: Prisma.LiveReportWhereInput = { AND: [scope, visibility, {
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    startedAt: {
      ...(filters.from ? { gte: shanghaiDate(`${filters.from}T00:00`)! } : {}),
      ...(filters.to ? { lt: new Date(shanghaiDate(`${filters.to}T00:00`)!.getTime() + 86400000) } : {}),
    },
  }] };
  const count = await tx.liveReport.count({ where });
  const pages = Math.max(1, Math.ceil(count / 30));
  const page = Math.min(filters.page, pages);
  const rows = await tx.liveReport.findMany({ where, orderBy: [{ startedAt: "desc" }, { id: "asc" }], skip: (page - 1) * 30, take: 30, include: { branch: true, workSession: { select: { leadTask: { select: { id: true } } } } } });
  const reports = rows.map(r => ({ ...r, canDelete: !r.workSession?.leadTask && canManageLiveReports(actor, r.branch), canDeleteMoney: !r.workSession?.leadTask && canManageLiveReports(actor, r.branch) }));
  // 选择器也遵循权限：过去负责的账号显示历史名称，不读取交接后的当前资料。
  const historical = await tx.liveReport.findMany({ where: scope, distinct: ["accountId"],
    select: { accountId: true, accountName: true, douyinId: true }, orderBy: { startedAt: "desc" } });
  const current = await tx.douyinAccount.findMany({ where: isAccountBoss(actor) ? {} : { OR: [{ branch: reportManagementScope(actor) }, ...(isReportOperator(actor) ? [{ branchId: actor.branchId ?? "", operatorId: actor.id }] : [])] }, select: { id: true, name: true, douyinId: true } });
  const options = new Map(historical.map((r) => [r.accountId, { id: r.accountId, name: r.accountName, douyinId: r.douyinId }]));
  for (const account of current) options.set(account.id, account);
  const canCreate = (await readReportAccountOptions(tx, token)).length > 0;
  return { reports, count, page, pages, accounts: [...options.values()], canCreate };
}
export async function readLiveReport(tx: Prisma.TransactionClient, token: string, id: string) {
  const actor = await requireAccountActor(tx, token);
  const report = await tx.liveReport.findFirst({ where: { AND: [liveReportScope(actor), { id }] }, include: { branch: true, workSession: { select: { leadTask: { select: { id: true } } } } } });
  if (!report) return null;
  const history = await tx.auditLog.findMany({ where: { targetType: "LiveReport", targetId: id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
  return { report, history, leadTaskId: report.workSession?.leadTask?.id, canEdit: canManageLiveReports(actor, report.branch), canEditMonetization: canManageLiveReports(actor, report.branch) };
}
