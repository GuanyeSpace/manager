import type { Prisma } from "@/app/generated/prisma/client";
import { Role, EmploymentStatus } from "@/app/generated/prisma/enums";

// 应用内固定的 advisory lock 键，串行化所有「可能改变在职老板集合」的岗位/在职状态写入。
// 锁随事务提交/回滚自动释放。
const USER_MUTATION_LOCK_ID = 47401;

export class ActiveBossConstraintError extends Error {}

// 操作者在等待期间被并发降岗/离职，过期的老板身份不能再继续敏感修改。
export class ActorPermissionChangedError extends Error {}

// 业务规则/字段校验错误。携带 fieldErrors 时以字段错误返回，否则以普通错误返回。
export class UserActionError extends Error {
  readonly fieldErrors?: Record<string, string[]>;

  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

// 所有岗位/在职状态写入必须先获取这个锁，再在事务内重读最新状态。
// 这样不会依赖事务外读取的旧快照来决定是否跳过保护。
export async function acquireUserMutationLock(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${USER_MUTATION_LOCK_ID})::text`;
}

// 重读操作者当前状态，确认仍是「在职老板」。调用前必须先持有 mutation 锁。
export function assertActorCanManage(
  actor: { role: Role; employmentStatus: EmploymentStatus; mustChangePassword: boolean } | null
): void {
  if (
    !actor ||
    actor.role !== Role.BOSS ||
    actor.employmentStatus !== EmploymentStatus.ACTIVE ||
    actor.mustChangePassword
  ) {
    throw new ActorPermissionChangedError();
  }
}

// target 必须是锁内重读到的最新状态。只有「在职老板将被移除」时才检查数量。
export async function assertActiveBossInvariant(
  tx: Prisma.TransactionClient,
  target: { role: Role; employmentStatus: EmploymentStatus },
  nextRole: Role,
  nextStatus: EmploymentStatus
): Promise<void> {
  const isActiveBoss =
    target.role === Role.BOSS && target.employmentStatus === EmploymentStatus.ACTIVE;
  const remainsActiveBoss = nextRole === Role.BOSS && nextStatus === EmploymentStatus.ACTIVE;
  if (!isActiveBoss || remainsActiveBoss) return;

  const activeBosses = await tx.user.count({
    where: { role: Role.BOSS, employmentStatus: EmploymentStatus.ACTIVE },
  });
  if (activeBosses <= 1) {
    throw new ActiveBossConstraintError();
  }
}
