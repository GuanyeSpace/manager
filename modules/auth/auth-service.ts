import type { Prisma } from "@/app/generated/prisma/client";
import { EmploymentStatus, AuditAction } from "@/app/generated/prisma/enums";
import { writeAudit } from "@/lib/audit";
import { generateSessionToken, sessionExpiresAt } from "@/lib/auth/session-core";

export class AuthStateChangedError extends Error {}
export class SessionRevokedError extends Error {}

export type AuthTestHooks = {
  afterUserLock?: () => Promise<void>;
};

// 登录：在事务内锁定用户行，复核「密码哈希未变 + 仍在职」，再写 lastLoginAt + 会话 + 审计。
// verifiedHash 是事务外验证密码时用到的哈希；锁行后若哈希已变，说明期间发生过改密/重置。
export async function createLoginSession(
  tx: Prisma.TransactionClient,
  input: { userId: string; verifiedHash: string; ip: string | null },
  hooks?: AuthTestHooks
): Promise<{ token: string; expiresAt: Date; mustChangePassword: boolean }> {
  const rows = await tx.$queryRaw<Array<{ passwordHash: string; employmentStatus: EmploymentStatus; mustChangePassword: boolean }>>`
    SELECT "passwordHash", "employmentStatus", "mustChangePassword"
    FROM "User" WHERE "id" = ${input.userId} FOR UPDATE
  `;
  const row = rows[0];
  if (!row || row.passwordHash !== input.verifiedHash || row.employmentStatus !== EmploymentStatus.ACTIVE) {
    throw new AuthStateChangedError();
  }
  await hooks?.afterUserLock?.();

  const token = generateSessionToken();
  const expiresAt = sessionExpiresAt();
  await tx.user.update({ where: { id: input.userId }, data: { lastLoginAt: new Date() } });
  await tx.session.create({ data: { id: token, userId: input.userId, expiresAt } });
  await writeAudit({
    db: tx,
    actorId: input.userId,
    action: AuditAction.LOGIN_SUCCESS,
    targetType: "User",
    targetId: input.userId,
    ip: input.ip,
  });

  return { token, expiresAt, mustChangePassword: row.mustChangePassword };
}

// 本人改密：锁行复核「密码哈希未变 + 仍在职 + 当前会话仍存在」，再撤销其他会话并签发新会话。
export async function changePasswordSession(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    sessionToken: string;
    verifiedHash: string;
    newPasswordHash: string;
    ip: string | null;
  },
  hooks?: AuthTestHooks
): Promise<{ token: string; expiresAt: Date }> {
  const rows = await tx.$queryRaw<Array<{ passwordHash: string; employmentStatus: EmploymentStatus }>>`
    SELECT "passwordHash", "employmentStatus"
    FROM "User" WHERE "id" = ${input.userId} FOR UPDATE
  `;
  const row = rows[0];
  if (!row || row.passwordHash !== input.verifiedHash || row.employmentStatus !== EmploymentStatus.ACTIVE) {
    throw new AuthStateChangedError();
  }
  await hooks?.afterUserLock?.();

  const currentSession = await tx.session.findUnique({ where: { id: input.sessionToken } });
  if (
    !currentSession ||
    currentSession.userId !== input.userId ||
    currentSession.expiresAt.getTime() <= Date.now()
  ) {
    throw new SessionRevokedError();
  }

  const token = generateSessionToken();
  const expiresAt = sessionExpiresAt();
  await tx.user.update({
    where: { id: input.userId },
    data: { passwordHash: input.newPasswordHash, mustChangePassword: false },
  });
  await tx.session.deleteMany({ where: { userId: input.userId } });
  await tx.session.create({ data: { id: token, userId: input.userId, expiresAt } });
  await writeAudit({
    db: tx,
    actorId: input.userId,
    action: AuditAction.PASSWORD_CHANGE,
    targetType: "User",
    targetId: input.userId,
    ip: input.ip,
  });

  return { token, expiresAt };
}
