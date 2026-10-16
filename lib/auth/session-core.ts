import { randomBytes } from "node:crypto";

// 未保持登录的会话固定7天；保持登录按30天续期。
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export const REMEMBER_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_RENEW_INTERVAL_MS = 24 * 60 * 60 * 1000;

// 生成一个新的会话 token。这里只生成随机值，不落库、不写 cookie，
// 便于调用方把「创建会话记录」放进与业务写入相同的数据库事务里。
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

// 会话过期时间点。
export function sessionExpiresAt(rememberMe = false): Date {
  return new Date(Date.now() + (rememberMe ? REMEMBER_DURATION_MS : SESSION_DURATION_MS));
}
