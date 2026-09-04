import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";

// Prisma 7 的客户端必须配一个「驱动适配器」才能连数据库，官方推荐 PrismaPg（基于 node-postgres）。
// 连接串从 .env 的 DATABASE_URL 读取（Next.js 会自动加载 .env 到 process.env）。
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// 开发模式下 Next.js 会热重载代码，用 globalThis 缓存单例，避免每次重载都新建连接池。
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
