// 并发验证「至少保留一个在职老板」的修复。
//
// 必须在隔离的测试数据库运行，切勿指向开发库。用法见 README「并发测试」。
// 它会清空测试库里的用户/分公司/会话/审计数据。
import "dotenv/config";
import { prisma } from "../lib/db";
import { Role, EmploymentStatus } from "../app/generated/prisma/enums";
import {
  ActiveBossConstraintError,
  assertActiveBossInvariant,
} from "../modules/users/boss-guard";

async function reset() {
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
}

async function createBoss(username: string) {
  return prisma.user.create({
    data: {
      username,
      name: username,
      passwordHash: "not-a-real-hash",
      role: Role.BOSS,
      branchId: null,
      mustChangePassword: false,
    },
  });
}

function demote(bossId: string) {
  return prisma.$transaction(async (tx) => {
    await assertActiveBossInvariant(
      tx,
      { role: Role.BOSS, employmentStatus: EmploymentStatus.ACTIVE },
      Role.OPERATOR,
      EmploymentStatus.ACTIVE
    );
    await tx.user.update({ where: { id: bossId }, data: { role: Role.OPERATOR } });
  });
}

async function main() {
  await reset();
  const a = await createBoss("boss_a");
  const b = await createBoss("boss_b");

  const results = await Promise.allSettled([demote(a.id), demote(b.id)]);
  const fulfilled = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.filter((r) => r.status === "rejected").length;
  const activeBosses = await prisma.user.count({
    where: { role: Role.BOSS, employmentStatus: EmploymentStatus.ACTIVE },
  });

  if (fulfilled !== 1) throw new Error(`预期恰好 1 次降岗成功，实际 ${fulfilled}`);
  if (rejected !== 1) throw new Error(`预期恰好 1 次降岗被拒，实际 ${rejected}`);
  if (activeBosses < 1) throw new Error(`不变量被破坏：剩余 ${activeBosses} 个在职老板`);

  const rejectedResult = results.find((r) => r.status === "rejected");
  if (!(rejectedResult && rejectedResult.status === "rejected" && rejectedResult.reason instanceof ActiveBossConstraintError)) {
    throw new Error(`预期被拒原因是 ActiveBossConstraintError，实际 ${String(rejectedResult?.reason)}`);
  }

  // 只剩一个老板时，再降岗必须被拒
  const remaining = await prisma.user.findFirstOrThrow({
    where: { role: Role.BOSS, employmentStatus: EmploymentStatus.ACTIVE },
  });
  let singleBossRejected = false;
  try {
    await demote(remaining.id);
  } catch (e) {
    if (e instanceof ActiveBossConstraintError) singleBossRejected = true;
  }
  if (!singleBossRejected) throw new Error("唯一在职老板被降岗时应被拒绝");

  console.log("PASS: 并发降岗后仍至少保留一个在职老板，且唯一老板降岗被拒绝");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("FAIL:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
