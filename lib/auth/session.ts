import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { signSessionToken, verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session-token";
import { EmploymentStatus, type Role } from "@/app/generated/prisma/enums";

// 会话有效期：7 天（与需求确认过的默认值）
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

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

// 登录成功后调用：数据库里建一条会话记录，并给浏览器发 httpOnly cookie。
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({ data: { id: token, userId, expiresAt } });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, signSessionToken(token), {
    httpOnly: true, // 浏览器脚本读不到，防 XSS 偷会话
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // 生产环境必须走 https
    expires: expiresAt,
    path: "/",
  });
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

// 删除某用户的所有会话（离职时调用）
export async function destroyAllSessionsOfUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
