import type { Prisma } from "@/app/generated/prisma/client";
import { requireAccountActor } from "@/modules/accounts/service";
import { isAccountBoss } from "@/lib/auth/account-permissions";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { writeAudit } from "@/lib/audit";
import { createBranchSchema, renameBranchSchema, toggleBranchSchema } from "./schema";

export async function mutateBranch(tx: Prisma.TransactionClient, token: string, command: "create" | "rename" | "toggle", raw: unknown, ip: string) {
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  if (!isAccountBoss(actor)) throw new UserActionError("老板权限已变化，请刷新后重试");
  if (command === "create") {
    const input = createBranchSchema.parse(raw);
    const branch = await tx.branch.create({ data: input });
    await writeAudit({ db: tx, actorId: actor.id, action: "BRANCH_CREATE", targetType: "Branch", targetId: branch.id, detail: { name: branch.name }, ip });
    return branch.id;
  }
  const input = command === "rename" ? renameBranchSchema.parse(raw) : toggleBranchSchema.parse(raw);
  const before = await tx.branch.findUnique({ where: { id: input.branchId } });
  if (!before) throw new UserActionError("分公司不存在");
  const name = command === "rename" ? renameBranchSchema.parse(raw).name : null;
  const data = name !== null ? { name } : { status: before.status === "ACTIVE" ? "INACTIVE" as const : "ACTIVE" as const };
  const updated = await tx.branch.update({ where: { id: before.id }, data });
  await writeAudit({ db: tx, actorId: actor.id, action: "BRANCH_UPDATE", targetType: "Branch", targetId: before.id, detail: name !== null ? { name: { from: before.name, to: updated.name } } : { status: { from: before.status, to: updated.status } }, ip });
  return updated.id;
}
