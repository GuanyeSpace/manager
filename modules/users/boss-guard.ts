import type { Prisma } from "@/app/generated/prisma/client";
import { Role, EmploymentStatus } from "@/app/generated/prisma/enums";

// 应用内固定的 advisory lock 键，用于串行化「至少保留一个在职老板」的检查与写入。
const ACTIVE_BOSS_LOCK_ID = 47401;

export class ActiveBossConstraintError extends Error {}

// 当一次操作会让某个在职老板变成非老板或离职时，先串行化并重新计数。
// 必须在数据库事务内调用：pg_advisory_xact_lock 的锁随事务提交/回滚自动释放。
//
// 为什么用 advisory lock 而不是「先 count 再 update」：
// 两个老板并发把对方降岗/离职时，各自 count 都可能读到 2，然后都写入成功，
// 最终得到 0 个在职老板。advisory lock 把「计数 + 写入」串行化，后者会看到前者提交后的结果。
export async function assertActiveBossInvariant(
  tx: Prisma.TransactionClient,
  target: { role: Role; employmentStatus: EmploymentStatus },
  nextRole: Role,
  nextStatus: EmploymentStatus
): Promise<void> {
  const isActiveBoss =
    target.role === Role.BOSS && target.employmentStatus === EmploymentStatus.ACTIVE;
  const remainsActiveBoss = nextRole === Role.BOSS && nextStatus === EmploymentStatus.ACTIVE;

  // 不影响在职老板数量时直接放行，不抢锁。
  if (!isActiveBoss || remainsActiveBoss) return;

  // 返回值是 void，Prisma 无法反序列化，故转成 text；我们只关心锁本身。
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${ACTIVE_BOSS_LOCK_ID})::text`;
  const activeBosses = await tx.user.count({
    where: { role: Role.BOSS, employmentStatus: EmploymentStatus.ACTIVE },
  });
  if (activeBosses <= 1) {
    throw new ActiveBossConstraintError();
  }
}
