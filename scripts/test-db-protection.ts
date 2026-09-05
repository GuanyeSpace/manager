// 破坏性测试保护：验证在缺少配置/指向非测试库/未授权时，必须在任何连接、写入、删除前退出。
// 本测试只调用纯校验函数，不连接数据库。
import { validateTestEnv, TestDbConfigError } from "./lib/test-db";

let failures = 0;
function expectThrow(name: string, env: Record<string, string | undefined>): void {
  try {
    validateTestEnv(env);
    failures++;
    console.log("FAIL:", name, "(未抛出异常)");
  } catch (e) {
    if (e instanceof TestDbConfigError) console.log("PASS:", name);
    else {
      failures++;
      console.log("FAIL:", name, String(e));
    }
  }
}

expectThrow("生产环境被拒绝", {
  NODE_ENV: "production",
  TEST_DATABASE_URL: "postgresql://u:p@localhost:5433/manager_test?schema=public",
  ALLOW_TEST_DESTRUCTION: "true",
});

expectThrow("缺少 TEST_DATABASE_URL 时退出", {
  ALLOW_TEST_DESTRUCTION: "true",
});

expectThrow("指向非 _test 结尾库时退出", {
  TEST_DATABASE_URL: "postgresql://u:p@localhost:5433/notatest?schema=public",
  ALLOW_TEST_DESTRUCTION: "true",
});

expectThrow("未提供破坏性许可时退出", {
  TEST_DATABASE_URL: "postgresql://u:p@localhost:5433/manager_test?schema=public",
  DATABASE_URL: "postgresql://u:p@localhost:5433/manager?schema=public",
});

expectThrow("测试库与日常库相同被拒", {
  TEST_DATABASE_URL: "postgresql://u:p@localhost:5433/manager?schema=public",
  DATABASE_URL: "postgresql://u:p@localhost:5433/manager?schema=public",
  ALLOW_TEST_DESTRUCTION: "true",
});

if (failures > 0) {
  console.log(`\n${failures} FAILURES`);
  process.exit(1);
}
console.log("\nALL PASS");
