"use server";

import { compare, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { loginSchema, changePasswordSchema } from "@/modules/auth/schema";
import {
  getCurrentUser,
  destroyCurrentSession,
  generateSessionToken,
  sessionExpiresAt,
  setSessionCookie,
} from "@/lib/auth/session";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginFailures,
  type LoginRateLimitResult,
} from "@/lib/auth/rate-limit";
import { writeAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import { EmploymentStatus, AuditAction } from "@/app/generated/prisma/enums";
import { getWorkbenchPath } from "@/lib/auth/permissions";

// 用户不存在时也用这个假哈希做一次比较，让「用户不存在」和「密码错误」
// 两种情况的耗时接近，避免攻击者用响应时间探测用户名是否存在。
const DUMMY_HASH = "$2b$10$3vG1FBjwdp6Dr.2nH7ChpeWf7gv1fuEZjxlp/dsWj4FNin0GIxyKq";

// 改密事务内检测到密码已被并发重置/修改时抛出，用来回滚并提示用户重试。
class PasswordStateChangedError extends Error {}

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
      // 登录失败审计是尽力而为，审计失败不应改变「统一提示用户名或密码错误」的结果
      console.error("登录失败审计写入失败:", e);
    }
    return { error: "用户名或密码错误" };
  }

  const token = generateSessionToken();
  const expiresAt = sessionExpiresAt();

  try {
    // lastLoginAt、会话记录、成功审计一起提交，保证不会出现「有会话但审计缺失」的中间态。
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await tx.session.create({ data: { id: token, userId: user.id, expiresAt } });
      await writeAudit({
        db: tx,
        actorId: user.id,
        action: AuditAction.LOGIN_SUCCESS,
        targetType: "User",
        targetId: user.id,
        ip,
      });
    });
  } catch (e) {
    // 不向前端泄露任何数据库/堆栈细节
    console.error("登录处理失败:", e);
    return { error: "登录失败，请稍后重试" };
  }

  clearLoginFailures(ip, username);
  // 事务提交成功后再写 cookie
  await setSessionCookie(token, expiresAt);
  // 强制改密优先于岗位跳转：需要改密的用户先去改密页，否则按岗位去各自工作台
  redirect(user.mustChangePassword ? "/change-password" : getWorkbenchPath(user));
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

  // 新密码哈希在事务外先算好，事务内只做快操作，减少持有行锁的时间。
  const passwordHash = await hash(parsed.data.newPassword, 10);
  const token = generateSessionToken();
  const expiresAt = sessionExpiresAt();

  try {
    await prisma.$transaction(async (tx) => {
      // 锁住用户行，重新确认密码哈希与校验时一致；若已被并发重置/修改则回滚。
      const rows = await tx.$queryRaw<Array<{ passwordHash: string }>>`
        SELECT "passwordHash" FROM "User" WHERE "id" = ${user.id} FOR UPDATE
      `;
      const row = rows[0];
      if (!row || row.passwordHash !== current.passwordHash) {
        throw new PasswordStateChangedError();
      }

      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      });
      // 撤销其他设备旧会话，为当前浏览器签发一个全新会话。
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.session.create({ data: { id: token, userId: user.id, expiresAt } });
      await writeAudit({
        db: tx,
        actorId: user.id,
        action: AuditAction.PASSWORD_CHANGE,
        targetType: "User",
        targetId: user.id,
        ip: await getClientIp(),
      });
    });
  } catch (e) {
    if (e instanceof PasswordStateChangedError) {
      return { error: "密码状态已变化，请重新提交" };
    }
    console.error("修改密码失败:", e);
    return { error: "修改密码失败，请稍后重试" };
  }

  // 事务提交成功后再写 cookie，保证新 cookie 对应的会话一定存在。
  await setSessionCookie(token, expiresAt);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}
