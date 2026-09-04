// 种子数据脚本：可重复执行（幂等）。重跑不会报错、不会重复插入。
// 执行方式：npx prisma db seed（命令配置在 prisma7.config.ts 的 migrations.seed）
import "dotenv/config";
import { hash } from "bcryptjs";
import { prisma } from "../lib/db";
import { Role, BranchStatus } from "../app/generated/prisma/enums";

async function main() {
  // 初始密码从环境变量读取，绝不写进源码
  const bossPassword = process.env.SEED_BOSS_PASSWORD;
  if (!bossPassword) {
    throw new Error("缺少 SEED_BOSS_PASSWORD 环境变量，请在 .env 中设置老板账号的初始密码后重试");
  }

  // 1. 分公司：按唯一名称 upsert，已存在则不动
  await prisma.branch.upsert({
    where: { name: "广东佛山分公司" },
    update: {},
    create: { name: "广东佛山分公司", status: BranchStatus.ACTIVE },
  });
  console.log("✓ 分公司：广东佛山分公司（已存在则跳过）");

  // 2. 老板账号：只在不存在时创建。
  //    注意：重跑 seed 不会把老板已改过的密码重置回初始密码，这是安全设计。
  const existing = await prisma.user.findUnique({ where: { username: "WangGuanye" } });
  if (existing) {
    console.log("✓ 老板账号 WangGuanye 已存在，跳过创建（不会重置密码）");
  } else {
    const passwordHash = await hash(bossPassword, 10);
    await prisma.user.create({
      data: {
        username: "WangGuanye",
        name: "王冠业",
        passwordHash,
        role: Role.BOSS,
        branchId: null, // 老板为空 = 跨分公司
        mustChangePassword: true, // 首次登录强制改密
      },
    });
    console.log("✓ 已创建老板账号 WangGuanye（角色 BOSS、branchId=null、首次登录强制改密）");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("种子数据执行失败:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
