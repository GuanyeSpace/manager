import "server-only";
import { prisma } from "@/lib/db";
import { assertCanManageUsers } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { EmploymentStatus, type Role } from "@/app/generated/prisma/enums";
import type { Prisma } from "@/app/generated/prisma/client";

export type UserListFilters = {
  q: string;
  role: Role | "ALL";
  branchId: string | "ALL";
  status: "ACTIVE" | "RESIGNED" | "ALL";
};

// 用户列表。查询函数自身也做能力断言（不依赖页面已经拦过）。
export async function listUsers(actor: CurrentUser, filters: UserListFilters) {
  assertCanManageUsers(actor);

  const where: Prisma.UserWhereInput = {};
  if (filters.status !== "ALL") {
    where.employmentStatus =
      filters.status === "ACTIVE" ? EmploymentStatus.ACTIVE : EmploymentStatus.RESIGNED;
  }
  if (filters.role !== "ALL") {
    where.role = filters.role;
  }
  if (filters.branchId !== "ALL") {
    where.branchId = filters.branchId;
  }
  if (filters.q) {
    where.OR = [{ name: { contains: filters.q } }, { username: { contains: filters.q } }];
  }

  return prisma.user.findMany({
    where,
    include: { branch: true },
    orderBy: [{ employmentStatus: "asc" }, { createdAt: "desc" }],
  });
}

// 查单个用户（详情页使用）
export async function getUserById(actor: CurrentUser, id: string) {
  assertCanManageUsers(actor);
  return prisma.user.findUnique({ where: { id }, include: { branch: true } });
}

// 统计在职老板数量（「至少保留一个在职老板」规则使用）
export async function countActiveBosses() {
  return prisma.user.count({ where: { role: "BOSS", employmentStatus: "ACTIVE" } });
}
