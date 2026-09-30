# 开发、测试与文档维护规范

最后更新：2026-09-29。适用于所有接手 AI 和开发者。用户要求：正式数据保护、小步改动、先讨论的问题不得擅自落地。

## 1. 开发前

1. 阅读 AGENTS.md → docs/README.md → current-status.md → 相关规则/决策。
2. 查看 git status、目标文件和调用链，区分已有工作与本次变更；大量未提交文件不代表可丢弃。
3. 改 Next.js 代码前，阅读 node_modules/next/dist/docs/ 对应指南；Next16 有版本差异，不按旧知识直接重构路由/Server Actions。
4. 明确“用户要求、已有实现、未确认问题”三者，简要写本次范围、假设、验证条件。合理且已授权的小步工作继续执行；产品方向歧义需询问。
5. 把当前任务和状态写入 current-status.md；重大决定编号写入 decisions.md。无需新数据库迁移时明确注明。

## 2. 实施原则

- 只改完成目标必需的行，不夹带全库格式化、依赖升级、架构替换。
- 权限同时检查页面、查询和写服务；不得为满足前端展示把后台限制放宽。
- 岗位判断用 hasRole/userRoles/roleWhere 和具名能力函数；不能回退到单独 actor.role 比较。
- 所有写服务沿用事务、锁内身份复核、版本检查和原子审计。过期版本返回可理解提示，保留用户输入。
- 不删除正式用户、账号历史、场次、截图或已有字段以简化实现。
- 新功能避免从旧记录推断不存在的事实，例如实际开播、中控到岗、登录账号、零成本和默认无违规。
- 金额、时间和历史例外查 data-model.md；跨公司关联、主副卡、卡槽和手机实际账号都要重新验证。
- 不读取或复制 .env 真实值到回复、脚本输出、文档；只说明变量名和文件位置。

## 3. 本地启动

先准备不入库的 .env，字段参考 .env.example。只有全新、确认无业务数据的本地开发库才允许 seed。

```bash
npm ci
docker compose up -d
./node_modules/.bin/prisma migrate deploy --config prisma7.config.ts
./node_modules/.bin/prisma generate --config prisma7.config.ts
npm run dev
```

上述 migrate deploy 默认使用 DATABASE_URL，运行前必须确认指向本地目标库。Prisma7 的迁移与 generate 分开执行，不假设迁移命令自动生成客户端。

新增 schema 变更可在开发库用本地锁定的 prisma migrate dev 创建新迁移，再检查 SQL；禁止对正式库执行 migrate dev、reset、db push 或 seed。依赖版本按 package-lock.json，勿用 prisma@latest。

WORK_SCREENSHOT_DIR 未设置时用 .data/work-screenshots；测试/开发不得指到正式上传目录。

## 4. 隔离测试库

所有会写数据库的测试必须：

- 有 TEST_DATABASE_URL，库名以 _test 结尾；不能等于日常 DATABASE_URL 的数据库名。
- 显式 ALLOW_TEST_DESTRUCTION=true，NODE_ENV 不能是 production。
- 连接后核对 current_database()。只清理本轮唯一标识数据，禁止无条件全表删除。
- 测试账户、截图、迁移演练库结束后清理；清理失败必须如实报告，不能只看 ALL PASS 字样。

测试库迁移与测试执行是两个不同环境：prisma7.config.ts 只读取 DATABASE_URL。已在安全本地环境提供 TEST_DATABASE_URL 后，测试库迁移命令为：

```bash
# 先检查 TEST_DATABASE_URL 非空、为本机且库名 _test；不要直接复制未知连接串。
DATABASE_URL="$TEST_DATABASE_URL" ./node_modules/.bin/prisma migrate deploy --config prisma7.config.ts
./node_modules/.bin/prisma generate --config prisma7.config.ts
# 执行业务测试时恢复原 DATABASE_URL，不能让它与 TEST_DATABASE_URL 同名。
ALLOW_TEST_DESTRUCTION=true npm run test:accounts
```

不要单设 TEST_DATABASE_URL 就运行 migrate deploy，以为会迁移测试库。也不要全局 export DATABASE_URL=测试库 后运行受保护测试，它会正确拒绝与日常库同名。

## 5. 测试选取地图

| 改动 | 应覆盖的脚本/检查 |
| --- | --- |
| 限流、测试防护 | test:rate-limit、test:db-protection |
| 登录/改密/离职/重置 | test:auth-concurrency、test:auth-overlap、test:auth-overlap-fault |
| 人员/老板不变量 | test:concurrency、scripts/test-multi-roles.ts |
| 账号职责/交接/调拨 | test:accounts，必要时资源/工作台回归 |
| 流程配置/执行 | test:workbench；提醒组件 components/work-live-clock.test.ts |
| 上班、代控、跨日 | test:shifts |
| 异常/违规/截图 | test:evidence |
| 已归档更正 | test:corrections |
| 直播和旧打粉报表 | test:live-reports |
| 导粉认领/填写/软删除 | test:leads |
| 资源、物资单件化 | test:resources |
| 主副卡/号码/卡槽 | test:numbers |
| 导粉迁移 | test:lead-migration |
| 多岗位迁移 | scripts/test-role-migration.ts |
| 手机实际账号/来源导航/分页 | scripts/test-phone-navigation.ts |
| 手机登录关系迁移 | scripts/test-phone-migration.ts |

未在 package.json 注册的脚本用本地 tsx，例如 `./node_modules/.bin/tsx scripts/test-phone-navigation.ts`；提醒组件测试用 `./node_modules/.bin/tsx --test components/work-live-clock.test.ts`。仍需满足脚本的环境前提。

- 新迁移测试在本机新建独立临时库，先复现旧结构与样例，再应用新增迁移，比较全部原列。旧迁移专项只证明当时升级边界，不等于之后所有迁移也通过。
- HTTP 选项名称因脚本不同可能是 TEST_HTTP_BASE、RESOURCES_HTTP_BASE 等，先看脚本环境变量。启动一个 DATABASE_URL 指向隔离库的开发服务器，脚本仍使用正常日常 DATABASE_URL + TEST_DATABASE_URL 区分保护。
- 不要同时在同一测试库启动多套造老板数据的脚本；至少一名老板测试可能因其他套件的测试老板干扰而误判。顺序运行或用独立库。
- 最近临时 /tmp/run-manager-tests.mjs 和截图/fixture 是本机会话辅助物，不应成为新 AI 唯一可复现入口。
- 本次只是文档更新，不因为改文档去跑有数据写入的全套回归。

场景选择可参考 [关键场景验收清单](acceptance-checklist.md)，按变更选择，不能默认全部通过。

## 6. 验收层次

1. 类型/静态检查：npm run typecheck，相关 eslint；按改动范围选取。
2. 业务回归：权限、边界、并发冲突、失败回滚、历史值保留，避免只照着实现写同义测试。
3. HTTP：实际页面和 Server Action 所用入口是否可访问、未授权是否拒绝。
4. 浏览器：布局、表单保留、完整操作链、返回/筛选/分页/截图上传；用隔离测试资料。
5. 发布：构建成功、迁移状态、数据摘要、备份可读、应用健康、源码对应。HTTP200不代表已做浏览器验收。

只写实际运行的结果，失败/未运行/受阻分别标注。旧发布的 PASS 是历史证据，不可直接当成本次测试结果。检查通过后不要无理由重复耗时回归。

## 7. 每次必须同步文档

### 时点

- 新任务确定范围：更新 current-status 的当前任务，必要时建立待讨论条目。
- 用户确认决定：同一轮更新 decisions、business-rules 和相关专题；废止决定明确写被哪个ID替代。
- 完成一个小步：更新 current-status 与 CHANGELOG，记录代码、验证、剩余步骤。
- schema/数据契约改变：同步 data-model、data-dictionary 和迁移说明，不能只更新 Prisma 文件。
- 实际发布：更新 deployment 与 current-status，记录备份、迁移、健康检查、回退路径和未验证部分。
- 暂停/交接：记录停在哪个文件/命令、哪些成功、哪些没做、后台进程、临时资料、下一步。不要用“继续优化”作唯一交接。

### 完成定义

本次范围实现并验证，或限制已如实交代；文档与代码一致；没有把未上线写已上线；没有遗漏待办与冲突；用户已能从仓库理解结果。文档同步是任务的一部分，不是未来可选工作。

### 当前任务模板（放入 current-status）

```text
任务：
状态：讨论中 / 已确认待开发 / 开发中 / 待验证 / 待发布 / 已上线 / 阻塞
范围与不做：
涉及决策ID：
修改文件 / 数据迁移：
已经完成：
实际验证：命令、目标环境、结果、日期
尚未验证：
部署：未部署 / 发布标识与证据
数据保护：备份与核对结果（如适用）
剩余步骤：按执行顺序
交接：分支/工作区、运行进程、临时文件、需用户补充信息
```

### 日志模板（追加 CHANGELOG）

```text
## YYYY-MM-DD — 标题
状态：
需求/决定：
变更：
数据影响：
验证（实际）：
上线/回退（如有）：
未完成/限制：
关联文档与代码：
```

规则要求所有 AI 主动维护；当前没有自动监听对话、自动写文档或强制CI。不得承诺仅凭这些文件就能保证任何第三方AI永远遵守。

## 2026-09-29新增分公司专项

使用既有隔离测试环境运行 `npx tsx scripts/test-branches.ts`；覆盖增改启停、管理锁真实等待、会话撤销、撤岗/离职/强制改密拒绝及审计回滚。完整本轮矩阵见 [检查报告](system-review-20260929.md)。测试仍不得对正式库运行。

账号封禁专项：`scripts/test-account-ban.ts`覆盖日期校验、权限、封禁/到期执行限制、换绑保留、状态历史；`scripts/test-ban-migration.ts`在独立临时库验证20表旧列及新增约束。仍按本文件隔离测试要求执行。

## 每次更新同步GitHub（2026-09-30用户要求）

仓库https://github.com/GuanyeSpace/manager.git，origin/main。用户已授权以后每次完成更新后提交并推送，无需重复询问。顺序为验证与文档同步→敏感检查→明确路径暂存→核对暂存差异→commit→fetch检查远程关系→非强制push→核对远程SHA。分支开发则同步对应远程分支，不擅自合并main。不提交已排除的.claude/launch.json删除、不输出含凭证的远程URL，不force push或覆盖他人改动。网络/认证/冲突导致失败时如实写明提交未同步，保留现场。纯文档更新验证文档，不触发生产部署。
