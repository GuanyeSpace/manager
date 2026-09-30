import "dotenv/config";
import { hash } from "bcryptjs";
import { prisma } from "../lib/db";
import { acquireUserMutationLock } from "../modules/users/boss-guard";
import { writeAudit } from "../lib/audit";

async function main() {
  const password = process.env.SEED_BOSS_PASSWORD;
  if (!password || password.length < 16) throw new Error("请通过环境变量设置至少 16 位初始密码");
  const passwordHash = await hash(password, 12);
  await prisma.$transaction(async (tx) => {
    await acquireUserMutationLock(tx);
    if (await tx.user.count()) throw new Error("数据库已有用户，初始化已停止，不会覆盖现有账号");
    const user = await tx.user.create({ data: { username: "WangGuanye", name: "王冠业", role: "BOSS", passwordHash, mustChangePassword: true } });
    await writeAudit({ db: tx, actorId: user.id, action: "USER_CREATE", targetType: "User", targetId: user.id, detail: { source: "production-initialization", username: user.username } });
  });
  console.log("老板账号已初始化，首次登录需修改密码；未创建分公司、员工或业务数据。");
}
main().catch(() => { console.error("初始化失败，请检查环境变量或数据库是否为空"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
