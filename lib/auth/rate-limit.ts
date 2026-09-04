// 登录失败频率限制：同一 IP 15 分钟内失败 5 次，锁定 15 分钟。
// simplification: 计数保存在进程内存中，服务重启即清零；单实例部署足够。
// 升级触发条件：需要多实例部署，或锁定状态必须跨重启保持时，改为数据库存储。
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

type AttemptEntry = {
  failures: number;
  windowStart: number;
  lockedUntil: number | null;
};

const attempts = new Map<string, AttemptEntry>();

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry) return { allowed: true, retryAfterSeconds: 0 };

  // 窗口已过期，重新计数
  if (entry.windowStart + WINDOW_MS <= now) {
    attempts.delete(ip);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.lockedUntil !== null && entry.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.windowStart + WINDOW_MS <= now) {
    attempts.set(ip, { failures: 1, windowStart: now, lockedUntil: null });
    return;
  }
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCK_MS;
  }
}

export function clearLoginFailures(ip: string): void {
  attempts.delete(ip);
}
