import type { Prisma } from "@/app/generated/prisma/client";
import { roleWhere } from "@/lib/auth/roles";
import { UserActionError } from "@/modules/users/boss-guard";
export async function availableAnchors(tx: Prisma.TransactionClient, branchId: string) {
  return tx.user.findMany({ where: { employmentStatus: "ACTIVE", OR: [{branchId, AND:[roleWhere("ANCHOR")]}, roleWhere("BOSS")] }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}
export async function requireSessionAnchor(tx: Prisma.TransactionClient, id: string, branchId: string) {
  const person = await tx.user.findFirst({ where: { id, employmentStatus: "ACTIVE", OR: [{branchId, AND:[roleWhere("ANCHOR")]}, roleWhere("BOSS")] }, select: { id: true, name: true } });
  if (!person) throw new UserActionError("请选择本分公司在职主播或兼任老板作为本场实际主播");
  return person;
}
