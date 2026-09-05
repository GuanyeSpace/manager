import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createPrismaClient } from "../../lib/db";
import type { PrismaClient } from "../../app/generated/prisma/client";

const TEST_DB_PATTERN = /_test$/;

export class TestDbConfigError extends Error {}

function dbNameFromUrl(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

// 纯校验，不做任何连接/写入。任何破坏性测试都必须先经过这里。
export function validateTestEnv(
  env: Record<string, string | undefined> = process.env
): { url: string; dbName: string } {
  if (env.NODE_ENV === "production") {
    throw new TestDbConfigError("生产环境禁止运行破坏性测试");
  }
  const url = env.TEST_DATABASE_URL;
  if (!url) {
    throw new TestDbConfigError("缺少 TEST_DATABASE_URL，测试退出（不会回退到 DATABASE_URL）");
  }
  if (env.ALLOW_TEST_DESTRUCTION !== "true") {
    throw new TestDbConfigError("缺少 ALLOW_TEST_DESTRUCTION=true，测试退出");
  }
  const dbName = dbNameFromUrl(url);
  if (!TEST_DB_PATTERN.test(dbName)) {
    throw new TestDbConfigError(`测试库名 "${dbName}" 不在允许名单（必须以 _test 结尾）`);
  }
  if (env.DATABASE_URL) {
    const devName = dbNameFromUrl(env.DATABASE_URL);
    if (dbName === devName) {
      throw new TestDbConfigError("测试库不能与日常开发数据库相同");
    }
  }
  return { url, dbName };
}

export function resolveTestClient(): PrismaClient {
  const { url } = validateTestEnv();
  return createPrismaClient(url);
}

// 连接后核对真实数据库名，防止连接串与实际库不一致导致误删。
export async function assertTestDatabase(client: PrismaClient, expectedDbName: string): Promise<void> {
  const rows = await client.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  const actual = rows[0]?.current_database;
  if (actual !== expectedDbName) {
    throw new TestDbConfigError(`连接到的数据库 "${actual}" 与配置 "${expectedDbName}" 不一致`);
  }
}

// 每次运行生成唯一标识；测试数据都带这个前缀，只清理本次创建的数据。
export function newRunId(): string {
  return `test-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

// 只删除本次运行创建的数据，绝不无条件清空整张表。
export async function cleanupRun(client: PrismaClient, marker: string): Promise<void> {
  const users = await client.user.findMany({
    where: { username: { startsWith: marker } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await client.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] },
    });
    await client.user.deleteMany({ where: { id: { in: ids } } });
  }
  await client.branch.deleteMany({ where: { name: { startsWith: marker } } });
}
