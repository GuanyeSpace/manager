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
export async function getShiftHistory(page: number) { const t = await token(); return prisma.$transaction(tx => readShiftHistory(tx, t, page), { isolationLevel: "RepeatableRead" }); }
