// 纯内存限流逻辑的回归测试，无需数据库、无需启动应用。
import {
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginFailures,
} from "../lib/auth/rate-limit";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// 1) account+IP：一个账号连续失败被锁，同一 IP 的其他账号不受影响。
for (let i = 0; i < 5; i++) recordLoginFailure("ip-1", "userA");
const lockA = checkLoginRateLimit("ip-1", "userA");
assert(lockA.allowed === false && lockA.reason === "account_ip", "userA 应被 account_ip 锁住");
assert(checkLoginRateLimit("ip-1", "userB").allowed === true, "同 IP 的 userB 不应被 userA 连累");

// 2) IP 总量：许多账号各失败一次，触发较宽松的 IP 总量限制。
for (let i = 0; i < 50; i++) recordLoginFailure("ip-total", `u${i}`);
const ipLock = checkLoginRateLimit("ip-total", "brand-new-user");
assert(ipLock.allowed === false && ipLock.reason === "ip", "应被 IP 总量限制拦截");

// 3) 账号跨 IP：分散 IP 猜同一个账号，达到退避档位后被拦。
for (let i = 0; i < 10; i++) recordLoginFailure(`ip-spread-${i}`, "target-account");
const acctLock = checkLoginRateLimit("ip-spread-new", "target-account");
assert(acctLock.allowed === false && acctLock.reason === "account", "应被账号跨 IP 退避拦截");

// 4) 登录成功清理：只清该账号相关桶，不清 IP 总量桶。
const ip = "ip-clear";
const username = "clear-user";
recordLoginFailure(ip, username);
clearLoginFailures(ip, username);
assert(checkLoginRateLimit(ip, username).allowed === true, "登录成功后该账号应恢复可试");

console.log("PASS: 分层限流（账号+IP / IP 总量 / 账号退避 / 成功清理）行为正确");
