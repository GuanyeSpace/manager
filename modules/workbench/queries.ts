import { readShift, readShiftHistory } from "./shifts";
import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { readConfigAccounts, readWorkbench, readWorkspace, readWorkSession, readWorkHistory } from "./service";
async function token() { const value = await getCurrentSessionToken(); if (!value) redirect("/login"); return value; }
export async function getWorkbench() { const t = await token(); return prisma.$transaction(tx => readWorkbench(tx, t), { isolationLevel: "RepeatableRead" }); }
export async function getWorkspace(id: string) { const t = await token(); return prisma.$transaction(tx => readWorkspace(tx, t, id), { isolationLevel: "RepeatableRead" }); }
export async function getWorkSession(id: string) { const t = await token(); return prisma.$transaction(tx => readWorkSession(tx, t, id), { isolationLevel: "RepeatableRead" }); }
export async function getWorkHistory(page: number) { const t = await token(); return prisma.$transaction(tx => readWorkHistory(tx, t, page), { isolationLevel: "RepeatableRead" }); }
export async function getConfigAccounts() { const t = await token(); return prisma.$transaction(tx => readConfigAccounts(tx, t), { isolationLevel: "RepeatableRead" }); }

export async function getShift() { const t = await token(); return prisma.$transaction(tx => readShift(tx, t), { isolationLevel: "RepeatableRead" }); }
export async function getShiftHistory(page: number, id?: string) { const t = await token(); return prisma.$transaction(tx => readShiftHistory(tx, t, page, id), { isolationLevel: "RepeatableRead" }); }

export async function getManagedSessions(params: import("./management").ManagementParams) { const t = await token(); const { readManagedSessions } = await import("./management"); return prisma.$transaction(tx => readManagedSessions(tx, t, params), { isolationLevel: "RepeatableRead" }); }
export async function getSupplementChoices() {
  const t = await token(); const { requireSessionBoss } = await import("./management");
  return prisma.$transaction(async tx => { await requireSessionBoss(tx, t); return {
    accounts: await tx.douyinAccount.findMany({ select: { id: true, name: true, douyinId: true, records: { orderBy: { version: "desc" }, select: { id: true, version: true, branchName: true, startedAt: true, endedAt: true } } }, orderBy: { name: "asc" } }),
    people: await tx.user.findMany({ select: { id: true, name: true, employmentStatus: true }, orderBy: { name: "asc" } }),
  }; }, { isolationLevel: "RepeatableRead" });
}

export async function getManagedShifts(params: import("./management").ManagementParams) {
  const t = await token(); const { requireSessionBoss, managementFilters, shiftCheckSummary } = await import("./management");
  return prisma.$transaction(async tx => {
    await requireSessionBoss(tx, t); const { page, pageSize, range } = managementFilters(params);
    const where = { ...(params.userId ? { userId: params.userId } : {}), startedAt: range, ...(params.status === "active" ? { endedAt: null } : params.status === "ended" ? { endedAt: { not: null } } : params.status === "early" ? { endedAt: { not: null }, earlyEndReason: { not: null } } : {}) };
    const rows = await tx.workShift.findMany({ where, orderBy: [{ startedAt: "desc" }, { id: "asc" }], take: pageSize, skip: (page - 1) * pageSize });
    const people = await tx.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    return { rows: rows.map(s => ({ ...s, summary: shiftCheckSummary(s.checks as import("./schema").EquipmentChecks) })), people, count: await tx.workShift.count({ where }), page, pageSize };
  }, { isolationLevel: "RepeatableRead" });
}
