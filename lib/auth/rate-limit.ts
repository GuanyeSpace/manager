// 登录频率限制：分层策略，避免「一个人输错就封住整个公司出口 IP」。
//
// 三层：
// 1) accountIp：同一「账号 + 来源 IP」连续失败次数。目标单一账号从单一来源的爆破。
// 2) ip：同一来源 IP 上所有账号的失败总数（较宽松）。目标同一出口批量试不同账号。
// 3) account：同一账号跨 IP 的失败总数，采用渐进式退避。目标分布式猜一个账号，
//    同时把「恶意锁死别人账号」的门槛抬得较高，避免轻易 DoS。
//
// 阈值取舍（百人规模、单出口 IP）：
// - accountIp 5 次锁 15 分钟：正常用户偶发输错 2~3 次不受影响，连续爆破很快被拦。
// - ip 50 次锁 15 分钟：几十名员工同时手误也远达不到，批量扫号会被拦。
// - account 退避：10 次 1 分钟 → 20 次 5 分钟 → 40 次 30 分钟，越试越慢。
//
// 已知限制：
// - 计数在进程内存中，服务重启即清零；多实例部署时不共享（本版不引入 Redis）。
// - 达到 MAX_ENTRIES 后会按过期优先、再按插入顺序淘汰，防止内存无限增长。

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 10_000;

export const LOGIN_RATE_LIMIT = {
  windowMs: WINDOW_MS,
  accountIp: { maxFailures: 5, lockMs: 15 * 60 * 1000 },
  ip: { maxFailures: 50, lockMs: 15 * 60 * 1000 },
  // 从高到低排列，取第一个命中的档位
  accountBackoff: [
    { failures: 40, lockMs: 30 * 60 * 1000 },
    { failures: 20, lockMs: 5 * 60 * 1000 },
    { failures: 10, lockMs: 60 * 1000 },
  ],
  maxEntries: MAX_ENTRIES,
} as const;

type Bucket = {
  failures: number;
  windowStart: number;
  lockedUntil: number | null;
};

export type RateLimitReason = "account_ip" | "ip" | "account";

export type LoginRateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: RateLimitReason; retryAfterSeconds: number };

const buckets = new Map<string, Bucket>();

function keyFor(kind: string, ...parts: string[]): string {
  // 用 \u0000 分隔，避免 username/ip 拼接时产生碰撞
  return [kind, ...parts].join("\u0000");
}

function prune(now: number): void {
  if (buckets.size <= MAX_ENTRIES) return;

  for (const [key, b] of buckets) {
    const expiredWindow = b.windowStart + WINDOW_MS <= now;
    const lockExpired = b.lockedUntil === null || b.lockedUntil <= now;
    if (expiredWindow && lockExpired) buckets.delete(key);
  }

  // 仍超量时，按插入顺序（Map 迭代顺序）淘汰最老的条目
  if (buckets.size > MAX_ENTRIES) {
    const excess = buckets.size - MAX_ENTRIES;
    let i = 0;
    for (const key of buckets.keys()) {
      if (i++ >= excess) break;
      buckets.delete(key);
    }
  }
}

function lockedStatus(key: string, now: number): { allowed: boolean; retryAfterSeconds: number } {
  const b = buckets.get(key);
  if (!b) return { allowed: true, retryAfterSeconds: 0 };
  if (b.windowStart + WINDOW_MS <= now) {
    buckets.delete(key);
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (b.lockedUntil !== null && b.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((b.lockedUntil - now) / 1000),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

function recordFixed(key: string, now: number, maxFailures: number, lockMs: number): void {
  prune(now);
  const b = buckets.get(key);
  if (!b || b.windowStart + WINDOW_MS <= now) {
    buckets.set(key, { failures: 1, windowStart: now, lockedUntil: null });
    return;
  }
  b.failures += 1;
  if (b.failures >= maxFailures) {
    b.lockedUntil = now + lockMs;
  }
}

function accountBackoffLockMs(failures: number): number | null {
  for (const tier of LOGIN_RATE_LIMIT.accountBackoff) {
    if (failures >= tier.failures) return tier.lockMs;
  }
  return null;
}

function recordAccount(key: string, now: number): void {
  prune(now);
  const b = buckets.get(key);
  if (!b || b.windowStart + WINDOW_MS <= now) {
    buckets.set(key, { failures: 1, windowStart: now, lockedUntil: null });
    return;
  }
  b.failures += 1;
  const lockMs = accountBackoffLockMs(b.failures);
  // 已在锁定期内不重复顺延，锁到点自动解除；否则按当前档位设置新的锁
  if (lockMs !== null && (b.lockedUntil === null || b.lockedUntil <= now)) {
    b.lockedUntil = now + lockMs;
  }
}

export function checkLoginRateLimit(ip: string, username: string): LoginRateLimitResult {
  const now = Date.now();

  const accountIp = lockedStatus(keyFor("aip", username, ip), now);
  if (!accountIp.allowed) {
    return { allowed: false, reason: "account_ip", retryAfterSeconds: accountIp.retryAfterSeconds };
  }

  const ipStatus = lockedStatus(keyFor("ip", ip), now);
  if (!ipStatus.allowed) {
    return { allowed: false, reason: "ip", retryAfterSeconds: ipStatus.retryAfterSeconds };
  }

  const accountStatus = lockedStatus(keyFor("acct", username), now);
  if (!accountStatus.allowed) {
    return { allowed: false, reason: "account", retryAfterSeconds: accountStatus.retryAfterSeconds };
  }

  return { allowed: true };
}

export function recordLoginFailure(ip: string, username: string): void {
  const now = Date.now();
  recordFixed(keyFor("aip", username, ip), now, LOGIN_RATE_LIMIT.accountIp.maxFailures, LOGIN_RATE_LIMIT.accountIp.lockMs);
  recordFixed(keyFor("ip", ip), now, LOGIN_RATE_LIMIT.ip.maxFailures, LOGIN_RATE_LIMIT.ip.lockMs);
  recordAccount(keyFor("acct", username), now);
}

// 登录成功后只清「该账号」相关的桶；IP 总量桶保留，因为一个成功登录
// 不代表同一出口的批量爆破已经停止。
export function clearLoginFailures(ip: string, username: string): void {
  buckets.delete(keyFor("aip", username, ip));
  buckets.delete(keyFor("acct", username));
}
