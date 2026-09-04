import "server-only";
import { prisma } from "@/lib/db";
import { assertCanManageBranches } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";

// 分公司列表。查询函数自身也做能力断言（不依赖页面已经拦过）。
export async function listBranches(actor: CurrentUser) {
  assertCanManageBranches(actor);
  return prisma.branch.findMany({ orderBy: { createdAt: "asc" } });
}
