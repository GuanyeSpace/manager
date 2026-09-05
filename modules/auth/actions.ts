"use server";

import { compare, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { loginSchema, changePasswordSchema } from "@/modules/auth/schema";
import {
  getCurrentUser,
  getCurrentSessionToken,
  destroyCurrentSession,
  setSessionCookie,
} from "@/lib/auth/session";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginFailures,
  type LoginRateLimitResult,
} from "@/lib/auth/rate-limit";
import {
  createLoginSession,
  changePasswordSession,
  AuthStateChangedError,
  SessionRevokedError,
} from "@/modules/auth/auth-service";
import { writeAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import { EmploymentStatus, AuditAction } from "@/app/generated/prisma/enums";
import { getWorkbenchPath } from "@/lib/auth/permissions";

// 用户不存在时也用这个假哈希做一次比较，让「用户不存在」和「密码错误」
// 两种情况的耗时接近，避免攻击者用响应时间探测用户名是否存在。
const DUMMY_HASH = "$2b$10$3vG1FBjwdp6Dr.2nH7ChpeWf7gv1fuEZjxlp/dsWj4FNin0GIxyKq";

export type LoginFormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[] | undefined>;
    }
  | undefined;

function rateLimitMessage(limit: Extract<LoginRateLimitResult, { allowed: false }>): string {
  const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
  switch (limit.reason) {
    case "account_ip":
      return `该账号从当前网络连续登录失败次数过多，请 ${minutes} 分钟后再试`;
    case "ip":
      return `当前网络登录请求过于频繁，请 ${minutes} 分钟后再试`;
    case "account":
      return `该账号登录失败次数过多，请 ${minutes} 分钟后再试`;
  }
}

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const ip = await getClientIp();

  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { username, password } = parsed.data;

  const rate = checkLoginRateLimit(ip, username);
  if (!rate.allowed) {
    return { error: rateLimitMessage(rate) };
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const passwordOk = await compare(password, user?.passwordHash ?? DUMMY_HASH);

  // 提示语统一，不区分「用户不存在」还是「密码错误」。
  // 不存在的用户名也会进入下面的失败分支，从而同样受账号/IP 组合与账号跨 IP 限流约束。
  if (!user || !passwordOk || user.employmentStatus !== EmploymentStatus.ACTIVE) {
    recordLoginFailure(ip, username);
    try {
      await writeAudit({
        action: AuditAction.LOGIN_FAIL,
        targetType: "User",
        targetId: user?.id ?? null,
        detail: { username },
        ip,
      });
    } catch (e) {
      console.error("登录失败审计写入失败:", e);
    }
    return { error: "用户名或密码错误" };
  }

  let session: { token: string; expiresAt: Date; mustChangePassword: boolean };
  try {
    // 事务内锁行复核密码哈希与在职状态，再创建会话；提交成功后才写 cookie。
    session = await prisma.$transaction((tx) =>
      createLoginSession(tx, { userId: user.id, verifiedHash: user.passwordHash, ip })
    );
  } catch (e) {
    if (e instanceof AuthStateChangedError) {
      return { error: "登录失败，请稍后重试" };
    }
    // 不向前端泄露任何数据库/堆栈细节
    console.error("登录处理失败:", e);
    return { error: "登录失败，请稍后重试" };
  }

  clearLoginFailures(ip, username);
  await setSessionCookie(session.token, session.expiresAt);
  // redirect 必须放在 try/catch 之外：它通过抛异常实现，不能被子集 catch 吞掉。
  redirect(session.mustChangePassword ? "/change-password" : getWorkbenchPath(user));
}

export type ChangePasswordFormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[] | undefined>;
    }
  | undefined;

// 修改密码（首次登录强制改密 + 以后自愿改密，走同一个动作）。
export async function changePasswordAction(
  _prevState: ChangePasswordFormState,
  formData: FormData
): Promise<ChangePasswordFormState> {
  // 独立校验登录态：不依赖页面拦截，直接调接口也必须被拒绝
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sessionToken = await getCurrentSessionToken();
  if (!sessionToken) redirect("/login");

  const parsed = changePasswordSchema.safeParse({
    oldPassword: formData.get("oldPassword") || undefined,
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { fieldErrors: { confirmPassword: ["两次输入的密码不一致"] } };
  }

  // 是否强制改密只依据数据库状态，绝不信任客户端传参。
  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, mustChangePassword: true },
  });
  if (!current) redirect("/login");
  const forced = current.mustChangePassword;

  if (!forced) {
    if (!parsed.data.oldPassword) {
      return { fieldErrors: { oldPassword: ["请输入旧密码"] } };
    }
    const oldPasswordOk = await compare(parsed.data.oldPassword, current.passwordHash);
    if (!oldPasswordOk) {
      return { fieldErrors: { oldPassword: ["旧密码不正确"] } };
    }
  }

  if (await compare(parsed.data.newPassword, current.passwordHash)) {
    return { fieldErrors: { newPassword: ["新密码不能与当前密码相同"] } };
  }

  const passwordHash = await hash(parsed.data.newPassword, 10);
  const ip = await getClientIp();

  let session: { token: string; expiresAt: Date };
  try {
    session = await prisma.$transaction(async (tx) =>
      changePasswordSession(tx, {
        userId: user.id,
        sessionToken,
        verifiedHash: current.passwordHash,
        newPasswordHash: passwordHash,
        ip,
      })
    );
  } catch (e) {
    if (e instanceof SessionRevokedError) {
      return { error: "会话已失效，请重新登录" };
    }
    if (e instanceof AuthStateChangedError) {
      return { error: "密码状态已变化，请重新提交" };
    }
    console.error("修改密码失败:", e);
    return { error: "修改密码失败，请稍后重试" };
  }

  await setSessionCookie(session.token, session.expiresAt);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}
