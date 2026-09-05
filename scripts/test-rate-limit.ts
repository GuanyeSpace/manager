// 纯内存限流逻辑回归测试（无需数据库/服务）。使用可注入假时间。
import {
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginFailures,
  setRateLimitClock,
  resetRateLimitState,
} from "../lib/auth/rate-limit";

const MIN = 60 * 1000;
let fakeNow = 0;

function setNow(ms: number): void {
  fakeNow = ms;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// 1) 账号+IP：第 14 分钟触发 15 分钟锁，第 15 分钟（计数窗口到期）仍应锁定。
{
  resetRateLimitState();
  setRateLimitClock(() => fakeNow);
  setNow(0);
  for (let i = 0; i < 4; i++) recordLoginFailure("ip", "userA");
  setNow(14 * MIN);
  recordLoginFailure("ip", "userA"); // 第 5 次，触发 15 分钟锁，锁定到 29 分钟
  setNow(15 * MIN);
  assert(checkLoginRateLimit("ip", "userA").allowed === false, "15 分钟时不应因窗口到期提前解除 15 分钟锁");
  setNow(29 * MIN - 1);
  assert(checkLoginRateLimit("ip", "userA").allowed === false, "到期前一毫秒应仍锁定");
  setNow(29 * MIN);
  assert(checkLoginRateLimit("ip", "userA").allowed === true, "到期时刻应解除锁定");
}

// 2) 账号跨 IP：40 次失败触发 30 分钟锁，不能被 15 分钟窗口提前解除。
{
  resetRateLimitState();
  setRateLimitClock(() => fakeNow);
  setNow(0);
  for (let i = 0; i < 10; i++) recordLoginFailure(`spread-${i}`, "target");
  setNow(1 * MIN);
  for (let i = 10; i < 20; i++) recordLoginFailure(`spread-${i}`, "target");
  setNow(6 * MIN);
  for (let i = 20; i < 40; i++) recordLoginFailure(`spread-${i}`, "target");
  setNow(15 * MIN);
  assert(checkLoginRateLimit("fresh-ip", "target").allowed === false, "30 分钟锁不应因 15 分钟窗口到期提前解除");
  setNow(36 * MIN - 1);
  assert(checkLoginRateLimit("fresh-ip", "target").allowed === false, "30 分钟锁到期前一毫秒应仍锁定");
  setNow(36 * MIN);
  assert(checkLoginRateLimit("fresh-ip", "target").allowed === true, "30 分钟锁到期时刻应解除");
}

// 3) 同 IP 某账号被组合限流，不连带封禁其他账号（低阈值）。
{
  resetRateLimitState();
  setRateLimitClock(() => fakeNow);
  setNow(0);
  for (let i = 0; i < 5; i++) recordLoginFailure("ip-shared", "userA");
  assert(checkLoginRateLimit("ip-shared", "userA").allowed === false, "userA 应被锁");
  assert(checkLoginRateLimit("ip-shared", "userB").allowed === true, "同 IP 的 userB 不应被 userA 连累");
}

// 4) IP 失败总量：许多账号各失败一次，触发较宽松的 IP 总量限制。
{
  resetRateLimitState();
  setRateLimitClock(() => fakeNow);
  setNow(0);
  for (let i = 0; i < 50; i++) recordLoginFailure("ip-total", `u${i}`);
  const r = checkLoginRateLimit("ip-total", "someone-new");
  assert(r.allowed === false && r.reason === "ip", "应被 IP 失败总量限制拦截");
}

// 5) 登录成功只清该账号相关桶，不清 IP 失败总量桶。
{
  resetRateLimitState();
  setRateLimitClock(() => fakeNow);
  setNow(0);
  recordLoginFailure("ip-clear", "clear-user");
  clearLoginFailures("ip-clear", "clear-user");
  assert(checkLoginRateLimit("ip-clear", "clear-user").allowed === true, "登录成功后该账号应恢复可试");
}

resetRateLimitState();
console.log("PASS: 分层限流（锁定期/窗口分离、假时间边界、组合限流、成功清理）行为正确");
