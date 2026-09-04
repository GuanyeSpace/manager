// 会话 cookie 值的签名与校验。cookie 值格式：<token>.<签名>
// proxy.ts（路由粗拦截）与 lib/auth/session.ts（数据库校验）共用此模块，
// 所以这里只放纯密码学逻辑，不依赖任何 Next.js API。
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "session";

function hmac(token: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("缺少 SESSION_SECRET 环境变量，请在 .env 中设置");
  }
  return createHmac("sha256", secret).update(token).digest("base64url");
}

// 对 token 做签名，得到可放进 cookie 的值
export function signSessionToken(token: string): string {
  return `${token}.${hmac(token)}`;
}

// 校验 cookie 值：签名不对或格式不对都返回 null。
// 注意：这只能证明「这个 cookie 是我们签发的」，不能证明会话仍然有效，
// 会话是否有效必须查数据库（lib/auth/session.ts 的 getCurrentUser）。
export function verifySessionToken(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return null;
  const token = cookieValue.slice(0, dot);
  const signature = cookieValue.slice(dot + 1);
  const expected = hmac(token);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return token;
}
