import type { Prisma } from "@/app/generated/prisma/client";
import { acquireUserMutationLock, UserActionError } from "@/modules/users/boss-guard";
import { requireAccountActor } from "@/modules/accounts/service";
import { writeAudit } from "@/lib/audit";
import { profileSchema } from "./schema";

export async function saveOwnProfile(tx: Prisma.TransactionClient, token: string, raw: unknown, ip: string) {
  const input = profileSchema.parse(raw);
  await acquireUserMutationLock(tx);
  const actor = await requireAccountActor(tx, token);
  const before = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { nickname: true, contactPhone: true, profileVersion: true } });
  if (before.profileVersion !== input.version) throw new UserActionError("个人资料已更新，请刷新后重试");
  const after = { nickname: input.nickname, contactPhone: input.contactPhone };
  const saved = await tx.user.update({ where: { id: actor.id }, data: { ...after, profileVersion: { increment: 1 } } });
  await writeAudit({ db: tx, actorId: actor.id, action: "USER_UPDATE", targetType: "User", targetId: actor.id, detail: { scope: "self-profile", before, after }, ip });
  return saved.profileVersion;
}
