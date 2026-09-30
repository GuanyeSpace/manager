import "server-only";
import { redirect } from "next/navigation";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { readLeadList, readLeadTask } from "./service";
async function token() { const value = await getCurrentSessionToken(); if (!value) redirect("/login"); return value; }
export async function getLeadList(view: string, page: number) { const t = await token(); return prisma.$transaction(tx => readLeadList(tx, t, view, page), { isolationLevel: "RepeatableRead" }); }
export async function getLeadTask(id: string) { const t = await token(); return prisma.$transaction(tx => readLeadTask(tx, t, id), { isolationLevel: "RepeatableRead" }); }
