import "server-only";
import { headers } from "next/headers";

// 提取用于登录限流的客户端 IP。
//
// 信任边界：
// - Next.js 的 App Router 在 server action / route handler 里拿不到原始 socket 地址，
//   只能看到请求头。x-forwarded-for / x-real-ip 是客户端也可以伪造的。
// - 因此只有显式设置 TRUST_PROXY=true（表示应用前面有一个由我们控制的反向代理，
//   并且该代理会「覆盖」而不是「追加」转发头）时才信任这些头。
// - 本地开发直连或未配置可信代理时，统一返回 "direct"：所有直连请求共用同一个桶，
//   虽然无法按 IP 精确区分，但能避免攻击者通过伪造 x-forwarded-for 旋转 IP 绕过限流。
export async function getClientIp(): Promise<string> {
  if (process.env.TRUST_PROXY !== "true") {
    return "direct";
  }

  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? "unknown";
}
