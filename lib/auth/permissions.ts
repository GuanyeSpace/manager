import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { Role } from "@/app/generated/prisma/enums";

// 页面级访问控制。所有需要登录的页面，第一行都调用这里的函数，
// 绝不在页面里自己写「读 cookie / 查用户 / 判断 redirect」的逻辑。

// 第 1 步：必须登录。未登录 → 登录页。返回当前用户，供后续岗位/能力检查使用。
export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// 第 2 步：强制改密。mustChangePassword=true 的用户只允许待在改密页。
// 改密页自身不调用本函数，其余每个受保护页面都要调用。
export async function requirePasswordChanged(user: CurrentUser): Promise<void> {
  if (user.mustChangePassword) redirect("/change-password");
}

// ---- 岗位能力检查：业务代码只允许用这些具名函数判断岗位，禁止散写 role === "BOSS" ----

// 当前用户登录后应去的工作台
export function getWorkbenchPath(user: CurrentUser): string {
  if (canAccessBossWorkspace(user)) return "/boss";
  if (canAccessControllerWorkspace(user)) return "/controller";
  return "/wip";
}

export function canAccessBossWorkspace(user: CurrentUser): boolean {
  return user.role === Role.BOSS;
}

export function canAccessControllerWorkspace(user: CurrentUser): boolean {
  return user.role === Role.CONTROLLER;
}

// 能力：管理分公司（本版只有老板有）
export function canManageBranches(user: CurrentUser): boolean {
  return user.role === Role.BOSS;
}

// 能力：管理用户（本版只有老板有）
export function canManageUsers(user: CurrentUser): boolean {
  return user.role === Role.BOSS;
}

// 能力断言：server action 与数据查询内部调用，岗位不符立刻送回自己的工作台。
// 每个 action / 查询都要自己调一遍，不得假设「页面已经拦过了」。
export function assertCanManageBranches(user: CurrentUser): void {
  if (!canManageBranches(user)) {
    redirect(getWorkbenchPath(user));
  }
}

export function assertCanManageUsers(user: CurrentUser): void {
  if (!canManageUsers(user)) {
    redirect(getWorkbenchPath(user));
  }
}

// ---- 页面守卫：工作台页面第一行调用；岗位不符时送回「自己的」工作台 ----

export async function requireBossPage(): Promise<CurrentUser> {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  if (!canAccessBossWorkspace(user)) {
    redirect(getWorkbenchPath(user));
  }
  return user;
}

export async function requireControllerPage(): Promise<CurrentUser> {
  const user = await requirePageUser();
  await requirePasswordChanged(user);
  if (!canAccessControllerWorkspace(user)) {
    redirect(getWorkbenchPath(user));
  }
  return user;
}
