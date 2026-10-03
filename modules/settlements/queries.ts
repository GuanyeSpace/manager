import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSessionToken } from "@/lib/auth/session";
import { readBossIncome,readConfirmed,readConfirmedDetail,settlementOptions,readAnchorIncome } from "./service";
import { readComparison } from "./comparison";
async function token(){const t=await getCurrentSessionToken();if(!t)redirect("/login");return t;}
export async function confirmedList(raw:unknown){const t=await token();return prisma.$transaction(tx=>readConfirmed(tx,t,raw),{isolationLevel:"RepeatableRead"});}
export async function confirmedDetail(id:string){const t=await token();return prisma.$transaction(tx=>readConfirmedDetail(tx,t,id),{isolationLevel:"RepeatableRead"});}
export async function confirmedOptions(){const t=await token();return prisma.$transaction(tx=>settlementOptions(tx,t));}
export async function anchorIncome(raw:unknown){const t=await token();return prisma.$transaction(tx=>readAnchorIncome(tx,t,raw),{isolationLevel:"RepeatableRead"});}
export async function comparison(raw:unknown){const t=await token();return prisma.$transaction(tx=>readComparison(tx,t,raw),{isolationLevel:"RepeatableRead"});}

export async function bossIncome(raw:unknown){const t=await token();return prisma.$transaction(tx=>readBossIncome(tx,t,raw),{isolationLevel:"RepeatableRead"});}
