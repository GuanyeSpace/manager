import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { signSessionToken, verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session-token";
import { EmploymentStatus, type Role } from "@/app/generated/prisma/enums";

export { SESSION_DURATION_MS, generateSessionToken, sessionExpiresAt } from "@/lib/auth/session-core";

// 从会话里还原出的当前用户。故意不含 passwordHash，防止密码哈希在代码里到处流传。
export type CurrentUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
  branchId: string | null;
  employmentStatus: EmploymentStatus;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
};

// 给浏览器写会话 cookie。必须在数据库事务成功提交之后再调用，
// 避免出现「数据库回滚了、浏览器却拿到一个不存在会话的 cookie」。
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, signSessionToken(token), {
    httpOnly: true, // 浏览器脚本读不到，防 XSS 偷会话
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // 生产环境必须走 https
    expires: expiresAt,
    path: "/",
  });
}

// 读取并校验当前会话 cookie，返回数据库里的会话 token（不查库）。
// 用于改密等场景在事务内复核「当前会话是否已被并发撤销」。
export async function getCurrentSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

// 读取当前登录用户。返回 null 表示未登录、会话过期、或用户已离职。
// 用 React cache() 包裹：同一次渲染里多处调用只查一次数据库。
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const token = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: token },
    include: { user: true },
  });
  if (!session) return null;

  // 过期会话顺手从数据库删除（cookie 的删除只能在 action / proxy 层做）
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session
      .delete({ where: { id: session.id } })
      .catch((e) => console.error("清理过期会话失败:", e));
    return null;
  }

  const user = session.user;
  // 双重保险：即使某些路径漏删了离职用户的会话，这里也会拒绝
  if (user.employmentStatus !== EmploymentStatus.ACTIVE) {
    return null;
  }

  // 只挑选安全字段返回，passwordHash 绝不离开这个函数
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    branchId: user.branchId,
    employmentStatus: user.employmentStatus,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
  };
});

// 退出登录：删除数据库会话记录 + 清除浏览器 cookie。
// 老板把某人设为离职时也会调用它删除该用户的所有会话（那里不操作 cookie）。
export async function destroySessionByToken(token: string): Promise<void> {
  await prisma.session.delete({ where: { id: token } }).catch((e) => {
    console.error("删除会话失败:", e);
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (token) {
    await destroySessionByToken(token);
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}
