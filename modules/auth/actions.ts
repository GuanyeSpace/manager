"use server";

import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/modules/auth/schema";
import { createSession, destroyCurrentSession } from "@/lib/auth/session";
import { checkRateLimit, recordLoginFailure, clearLoginFailures } from "@/lib/auth/rate-limit";
import { writeAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import { EmploymentStatus, AuditAction } from "@/app/generated/prisma/enums";

// 用户不存在时也用这个假哈希做一次比较，让「用户不存在」和「密码错误」
// 两种情况的耗时接近，避免攻击者用响应时间探测用户名是否存在。
const DUMMY_HASH = "$2b$10$3vG1FBjwdp6Dr.2nH7ChpeWf7gv1fuEZjxlp/dsWj4FNin0GIxyKq";

export type LoginFormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[] | undefined>;
    }
  | undefined;

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const ip = await getClientIp();

  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    const minutes = Math.max(1, Math.ceil(rate.retryAfterSeconds / 60));
    return { error: `失败次数过多，账号已临时锁定，请 ${minutes} 分钟后再试` };
  }

  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });
  const passwordOk = await compare(password, user?.passwordHash ?? DUMMY_HASH);

  // 提示语统一，不区分「用户不存在」还是「密码错误」
  if (!user || !passwordOk || user.employmentStatus !== EmploymentStatus.ACTIVE) {
    recordLoginFailure(ip);
    await writeAudit({
      action: AuditAction.LOGIN_FAIL,
      targetType: "User",
      targetId: user?.id ?? null,
      detail: { username },
      ip,
    });
    return { error: "用户名或密码错误" };
  }

  try {
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await createSession(user.id);
    await writeAudit({
      actorId: user.id,
      action: AuditAction.LOGIN_SUCCESS,
      targetType: "User",
      targetId: user.id,
      ip,
    });
  } catch (e) {
    // 不向前端泄露任何数据库/堆栈细节
    console.error("登录处理失败:", e);
    return { error: "登录失败，请稍后重试" };
  }

  clearLoginFailures(ip);
  // 登录后的落点：commit 4 改为强制改密判断，commit 5 改为按岗位跳转
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}
