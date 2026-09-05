import { prisma } from "@/lib/db";
import type { Prisma } from "@/app/generated/prisma/client";
import type { AuditAction } from "@/app/generated/prisma/enums";

type WriteAuditInput = {
  actorId?: string | null;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  detail?: Prisma.InputJsonValue | null;
  ip?: string | null;
  // 传入事务客户端时，审计记录与业务写入同属一个事务，任一失败都会一起回滚。
  db?: Prisma.TransactionClient;
};

// 所有审计日志都必须通过这个函数写入，禁止在业务代码里直接 prisma.auditLog.create。
// 注意：本函数在失败时会抛出异常（而不是吞掉）。关键业务写入应把 writeAudit 放在
// 同一个事务里并传入 db，从而保证「业务成功 = 审计成功」原子一致。
export async function writeAudit({
  actorId = null,
  action,
  targetType,
  targetId = null,
  detail = null,
  ip = null,
  db,
}: WriteAuditInput): Promise<void> {
  const client = db ?? prisma;
  await client.auditLog.create({
    // Prisma 的 Json 字段不接受 null，用 undefined 表示「无内容」
    data: { actorId, action, targetType, targetId, detail: detail ?? undefined, ip },
  });
}
