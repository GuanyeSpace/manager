import "server-only";
import { headers } from "next/headers";

// 从请求头提取客户端 IP。
// simplification: 只读 x-forwarded-for / x-real-ip 两个常见头；直接连本机时取不到真实 IP，返回 "unknown"。
// 升级触发条件：接入反向代理后，按代理配置收紧信任规则（不信任客户端自带的 x-forwarded-for）。
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? "unknown";
}
