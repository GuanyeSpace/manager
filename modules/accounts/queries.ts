import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { readAccountList, readAccountDetail, readAccountHistory, readAccountOptions } from "./data";

async function token() {
  const value = await getCurrentSessionToken();
  if (!value) redirect("/login");
  return value;
}

export async function listAccounts(q: string) {
  const sessionToken = await token();
  return prisma.$transaction((tx) => readAccountList(tx, sessionToken, q.slice(0, 100)), { isolationLevel: "RepeatableRead" });
}
export async function getAccountDetail(id: string) {
  const sessionToken = await token();
  return prisma.$transaction((tx) => readAccountDetail(tx, sessionToken, id), { isolationLevel: "RepeatableRead" });
}
export async function listAccountHistory() {
  const sessionToken = await token();
  return prisma.$transaction((tx) => readAccountHistory(tx, sessionToken), { isolationLevel: "RepeatableRead" });
}
export async function getAccountOptions() {
  const sessionToken = await token();
  return prisma.$transaction((tx) => readAccountOptions(tx, sessionToken), { isolationLevel: "RepeatableRead" });
}
