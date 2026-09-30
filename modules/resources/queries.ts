import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { readPhoneList, readNumberList, readResourceList, readResourceDetail, readResourceOptions, readAnchors } from "./data";
import type { NumberFilters, ResourceKind } from "./schema";
async function token() { const t = await getCurrentSessionToken(); if (!t) redirect("/login"); return t; }
export async function listResources(kind: ResourceKind, q: string, page: number, archived = false) { const t = await token(); return prisma.$transaction(tx => readResourceList(tx, t, kind, q, page, archived), { isolationLevel: "RepeatableRead" }); }
export async function getResource(kind: ResourceKind, id: string) { const t = await token(); return prisma.$transaction(tx => readResourceDetail(tx, t, kind, id), { isolationLevel: "RepeatableRead" }); }
export async function getResourceOptions() { const t = await token(); return prisma.$transaction(tx => readResourceOptions(tx, t), { isolationLevel: "RepeatableRead" }); }
export async function getAnchors(id?: string) { const t = await token(); return prisma.$transaction(tx => readAnchors(tx, t, id), { isolationLevel: "RepeatableRead" }); }

export async function listNumbers(q: string, page: number, filters: Partial<NumberFilters>, pageSize = 20) { const t = await token(); return prisma.$transaction(tx => readNumberList(tx, t, q, page, filters, pageSize), { isolationLevel: "RepeatableRead" }); }

export async function listPhones(q: string, page: number, pageSize: number, userId: string, status: string) { const t = await token(); return prisma.$transaction(tx => readPhoneList(tx, t, q, page, pageSize, userId, status), { isolationLevel: "RepeatableRead" }); }
