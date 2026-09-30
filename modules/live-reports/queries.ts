import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { readLiveReports, readLiveReport, readReportAccountOptions } from "./data";
import type { ReportFilters } from "./schema";

async function token() {
  const value = await getCurrentSessionToken();
  if (!value) redirect("/login");
  return value;
}
export async function listLiveReports(filters: ReportFilters) {
  const value = await token();
  return prisma.$transaction((tx) => readLiveReports(tx, value, filters), { isolationLevel: "RepeatableRead" });
}
export async function getLiveReport(id: string) {
  const value = await token();
  return prisma.$transaction((tx) => readLiveReport(tx, value, id), { isolationLevel: "RepeatableRead" });
}
export async function getReportAccountOptions() {
  const value = await token();
  return prisma.$transaction((tx) => readReportAccountOptions(tx, value), { isolationLevel: "RepeatableRead" });
}
