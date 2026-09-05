// 登录失败频率限制：分层策略，避免「一个人输错就封住整个公司出口 IP」。
//
// 三层（均统计「失败次数」，不是全部请求次数）：
// 1) accountIp：同一「账号 + 来源 IP」连续失败次数。
// 2) ip：同一来源 IP 上所有账号的失败总数（较宽松）。
// 3) account：同一账号跨 IP 的失败总数，采用渐进式退避。
//
// 计数窗口与锁定期是两回事：窗口用于滚动统计失败次数，到期后清零；
// 锁定期（lockedUntil）独立存在，即使计数窗口已过期，只要还没到锁定截止时间就保持锁定。

type Clock = () => number;

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
let clock: Clock = () => Date.now();

// 测试专用：注入假时间 / 恢复真实时间 / 清空全部状态。
export function setRateLimitClock(fn: Clock): void {
  clock = fn;
}
export function resetRateLimitClock(): void {
  clock = () => Date.now();
}
export function resetRateLimitState(): void {
  buckets.clear();
  resetRateLimitClock();
}

function now(): number {
  return clock();
}

function keyFor(kind: string, ...parts: string[]): string {
  return [kind, ...parts].join("\u0000");
}

function prune(nowMs: number): void {
  if (buckets.size <= MAX_ENTRIES) return;

  // 先清理「窗口已过期且锁已解除」的条目；锁仍有效的一律保留。
  for (const [key, b] of buckets) {
    const windowExpired = b.windowStart + WINDOW_MS <= nowMs;
    const lockExpired = b.lockedUntil === null || b.lockedUntil <= nowMs;
    if (windowExpired && lockExpired) buckets.delete(key);
  }

  // 仍超量时只淘汰未锁定的最老条目，绝不因容量淘汰丢活动锁。
  if (buckets.size > MAX_ENTRIES) {
    for (const [key, b] of buckets) {
      if (buckets.size <= MAX_ENTRIES) break;
      const unlocked = b.lockedUntil === null || b.lockedUntil <= nowMs;
      if (unlocked) buckets.delete(key);
    }
  }
}

function checkBucket(key: string, nowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const b = buckets.get(key);
  if (!b) return { allowed: true, retryAfterSeconds: 0 };

  // 锁优先：即使计数窗口已过期，只要还在锁定期内就保持锁定。
  if (b.lockedUntil !== null && b.lockedUntil > nowMs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((b.lockedUntil - nowMs) / 1000),
    };
  }

  // 窗口过期且锁已解除：重置计数。
  if (b.windowStart + WINDOW_MS <= nowMs) {
    buckets.delete(key);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

function bucketExpired(b: Bucket, nowMs: number): boolean {
  const windowExpired = b.windowStart + WINDOW_MS <= nowMs;
  const lockExpired = b.lockedUntil === null || b.lockedUntil <= nowMs;
  return windowExpired && lockExpired;
}

function recordFixed(key: string, nowMs: number, maxFailures: number, lockMs: number): void {
  prune(nowMs);
  const b = buckets.get(key);
  if (!b || bucketExpired(b, nowMs)) {
    buckets.set(key, { failures: 1, windowStart: nowMs, lockedUntil: null });
    return;
  }
  // check 已在锁定期间拦截，这里只是防御，避免锁定期内被意外重置。
  if (b.lockedUntil !== null && b.lockedUntil > nowMs) return;
  b.failures += 1;
  if (b.failures >= maxFailures) {
    b.lockedUntil = nowMs + lockMs;
  }
}

function accountBackoffLockMs(failures: number): number | null {
  for (const tier of LOGIN_RATE_LIMIT.accountBackoff) {
    if (failures >= tier.failures) return tier.lockMs;
  }
  return null;
}

function recordAccount(key: string, nowMs: number): void {
  prune(nowMs);
  const b = buckets.get(key);
  if (!b || bucketExpired(b, nowMs)) {
    buckets.set(key, { failures: 1, windowStart: nowMs, lockedUntil: null });
    return;
  }
  if (b.lockedUntil !== null && b.lockedUntil > nowMs) return;
  b.failures += 1;
  const lockMs = accountBackoffLockMs(b.failures);
  // 只在恰好跨过某个档位（10/20/40）时设置/升级锁，避免同一档位内每次失败都重新锁一遍。
  const crossedTier = LOGIN_RATE_LIMIT.accountBackoff.some((tier) => tier.failures === b.failures);
  if (crossedTier && lockMs !== null && (b.lockedUntil === null || b.lockedUntil <= nowMs)) {
    b.lockedUntil = nowMs + lockMs;
  }
}

export function checkLoginRateLimit(ip: string, username: string): LoginRateLimitResult {
  const nowMs = now();

  const accountIp = checkBucket(keyFor("aip", username, ip), nowMs);
  if (!accountIp.allowed) {
    return { allowed: false, reason: "account_ip", retryAfterSeconds: accountIp.retryAfterSeconds };
  }

  const ipStatus = checkBucket(keyFor("ip", ip), nowMs);
  if (!ipStatus.allowed) {
    return { allowed: false, reason: "ip", retryAfterSeconds: ipStatus.retryAfterSeconds };
  }

  const accountStatus = checkBucket(keyFor("acct", username), nowMs);
  if (!accountStatus.allowed) {
    return { allowed: false, reason: "account", retryAfterSeconds: accountStatus.retryAfterSeconds };
  }

  return { allowed: true };
}

export function recordLoginFailure(ip: string, username: string): void {
  const nowMs = now();
  recordFixed(keyFor("aip", username, ip), nowMs, LOGIN_RATE_LIMIT.accountIp.maxFailures, LOGIN_RATE_LIMIT.accountIp.lockMs);
  recordFixed(keyFor("ip", ip), nowMs, LOGIN_RATE_LIMIT.ip.maxFailures, LOGIN_RATE_LIMIT.ip.lockMs);
  recordAccount(keyFor("acct", username), nowMs);
}

// 登录成功后只清「该账号」相关的桶；IP 失败总量桶保留，因为一个成功登录
// 不代表同一出口的批量爆破已经停止。
export function clearLoginFailures(ip: string, username: string): void {
  buckets.delete(keyFor("aip", username, ip));
  buckets.delete(keyFor("acct", username));
}
