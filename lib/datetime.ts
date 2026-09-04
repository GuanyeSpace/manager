// 时间显示工具。数据库统一存 UTC（Prisma DateTime 默认即 UTC），
// 展示时转 Asia/Shanghai。所有「给人看」的时间都必须经过这里格式化。
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
