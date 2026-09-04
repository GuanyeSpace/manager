import "server-only";
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
};

// 所有审计日志都必须通过这个函数写入，禁止在业务代码里直接 prisma.auditLog.create。
export async function writeAudit({
  actorId = null,
  action,
  targetType,
  targetId = null,
  detail = null,
  ip = null,
}: WriteAuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      // Prisma 的 Json 字段不接受 null，用 undefined 表示「无内容」
      data: { actorId, action, targetType, targetId, detail: detail ?? undefined, ip },
    });
  } catch (error) {
    // 审计写入失败只记录错误、不阻断主流程：
    // 登录和业务操作不应因为审计故障而失败。错误会留在服务端日志里可查。
    console.error("审计日志写入失败:", error);
  }
}
