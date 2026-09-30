# 2026-09-30 全系统复查

本轮是**只读复查**：没有修改业务代码、没有新增迁移、没有发布生产，只更新文档。复查基于隔离库、本机隔离开发服务和生产只读检查；不是“系统无漏洞”或“所有页面已人工验收”的结论。

## 1. 结论摘要

| 项目 | 本轮实际结果 |
| --- | --- |
| 隔离测试 | 24 个入口全部通过（23 个脚本 + 1 个组件测试）；其中 `test-work-evidence` 首次失败为复查环境变量配置问题，修正后重跑通过，非应用缺陷 |
| 静态检查 | `npm run typecheck` 退出 0；`eslint app components lib modules scripts` 退出 0；`git diff --check` 无输出 |
| 本地构建 | `npm run build`（`DATABASE_URL` 指向隔离库）退出 0，本机耗时 27 秒；未做生产受限构建，也未发布 |
| 浏览器验收 | headless Chrome 隔离夹具验证 `/accounts`、`/resources/numbers`、`/boss`、`/live-reports?view=monetization` 四页渲染与列结构通过 |
| 权限/安全只读审计 | 未发现未鉴权写入口、只比较 `actor.role` 的授权、凭证泄漏；确认 1 条已有中等级组合边界（K004）与 4 条低等级加固项 |
| 依赖审计 | `npm audit --omit=dev` 报 7 项（5 high / 2 moderate），比 09-29 记录多 3 个包；未自动修复（会跨主版本降级 Prisma） |
| 生产只读核验 | manager/nginx/docker 与 2 个 timer active；HTTPS `/login` 200、`/` 307；磁盘 18G/40G；证书 3 天后到期 |
| 数据安全 | 未对正式库执行任何写入、迁移或测试；隔离库与本轮夹具已清理，相关表残留计数为 0 |
| 文档一致性 | 发现并修正迁移数、字段数、链接数、日期戳、决策索引、路由视图等偏差；另澄清 1 处被误判为冲突的表数口径 |

## 2. 隔离测试环境

- `TEST_DATABASE_URL` 指向本机 `manager_accounts_test`（库名以 `_test` 结尾，19 次迁移，`public` 下 21 张表 = 20 业务表 + `_prisma_migrations`）。
- 日常 `DATABASE_URL` 仍为本机 `manager`，两者库名不同，满足 `scripts/lib/test-db.ts` 的保护前置；破坏性测试显式 `ALLOW_TEST_DESTRUCTION=true`，`NODE_ENV=development`。
- HTTP 类测试使用本机隔离开发服务 `next dev -p 3102`，其 `DATABASE_URL` 也指向隔离库；`WORK_SCREENSHOT_DIR`、`WORKBENCH_HTTP_SCREENSHOT_DIR` 均在系统临时目录下。
- 迁移状态核对：`prisma migrate status` 对隔离库报 19 migrations、schema up to date，无待应用。
- 清理核对：本轮运行后隔离库中 `User.username like 'test-%'`、`Branch.name like 'test-%'`、`DouyinAccount.douyinId like 'test-%'` 均为 0；浏览器夹具按 marker 删除后 6 张相关表残留均为 0。未对正式库做任何写入。

## 3. 测试矩阵（本轮实际运行）

| 入口 | 结果 | 主要覆盖 |
| --- | --- | --- |
| test-db-protection.ts | 通过 | 误库、缺开关、与日常库同名等保护 |
| test-rate-limit.ts | 通过 | 分层限流、锁定窗口、组合限流与清理 |
| test-boss-invariant.ts | 通过 | 最后一位老板保护、并发、被拒后无残留审计 |
| test-auth-concurrency.ts | 通过 | 改密/会话并发、过期会话拒绝 |
| test-auth-overlap.ts | 通过 | 登录与离职交错、最终会话撤销 |
| test-auth-overlap-fault.ts | 通过（23s） | 故障注入；子进程异常后本轮数据被清理 |
| test-accounts.ts | 通过 | 岗位校验、兼任、分公司授权、历史脱敏、交接、并发、回滚、撤权 |
| test-work-shifts.ts | 通过 | 班次跨日、重复与并发、结束门槛、隔离与回滚、旧场次兼容 |
| test-workbench.ts | 通过（含 HTTP） | 工作台/配置/执行/历史渲染、越权 404、快照、并发开播、收尾与数据分离 |
| test-work-evidence.ts | 首次失败，修正环境后通过（含 HTTP） | 截图校验、私有响应头、越权 404、匿名拒绝、归档入口 |
| test-work-corrections.ts | 通过（含 HTTP） | 到岗补填、场次更正、权限与时间重叠、原值与截图保留、回滚 |
| test-live-reports.ts | 通过（含 HTTP） | 指标、比例、时区、软删除与回收站、修改与审计回滚 |
| test-resources.ts | 通过（含 HTTP） | 主播/直播间多对多、分公司隔离、号码与账号双向关联、卡槽唯一与并发、调拨保护 |
| test-number-management.ts | 通过（含 HTTP） | 主副卡、真实筛选分页、关联编辑渲染 |
| test-leads.ts | 通过（含 HTTP） | 认领竞态、多场、草稿与零、完成、误认领纠正、回收站、审计与回滚 |
| test-multi-roles.ts | 通过（含 HTTP） | 多岗增撤、岗位筛选、双工作台、跨直播间导粉、单中控限制、老板保护 |
| test-phone-navigation.ts | 通过（含 HTTP） | 逐级返回与筛选保留、安全来源、10/20/50、登录账号登记、换卡保留、双向关联、越权隔离 |
| test-lead-migration.ts | 通过 | 18 张旧表原列保持、旧场次排除自动认领 |
| test-role-migration.ts | 通过 | 19 张旧表原列保持、旧员工岗位保留 |
| test-phone-migration.ts | 通过 | 19 张旧表原列保持、不推断实际登录账号 |
| test-account-ban.ts | 通过 | 封禁日期校验/待定、到期不自动解封、禁止准备开播、换绑保留、历史与清理 |
| test-ban-migration.ts | 通过 | 20 张旧表原列与旧启用值保持、新默认值与一致性约束 |
| test-branches.ts | 通过 | 分公司增改启停、锁内复核、真实会话撤销竞争、降岗/离职/改密拒绝、审计回滚 |
| components/work-live-clock.test.ts | 通过（tsx --test） | 提醒组件 3 个用例 |

## 4. 环境情况与失败澄清

- **test-work-evidence 的 404 不是应用缺陷**。该脚本把归档 PNG 复制到 `WORKBENCH_HTTP_SCREENSHOT_DIR`，再请求 `/workbench/screenshots/{id}` 期望服务端从自己的 `WORK_SCREENSHOT_DIR` 读取同一文件。本轮首次运行时服务端目录与脚本目标目录不一致，故 404；把两者设为同一临时目录后重跑通过（截图原始字节、私有响应头、越权 404、匿名拒绝均通过）。这是复查环境的配置问题，不修改测试断言，也不放宽安全校验。
- 首次测试驱动的 shell 脚本存在一次自身语法错误（仅执行了第一个用例），修正后重新执行全部 24 个入口；该错误只影响本地驱动脚本，不影响仓库文件。
- `pg` 驱动在本轮仍出现“同一 client 重叠 query”的弃用提示（与 09-29 复查一致），相关断言全部通过；尚未定位具体调用点，升级驱动前单独排查，不能归为业务失败。

## 5. 静态检查

- `npm run typecheck`（tsc --noEmit）退出 0，无输出。
- `./node_modules/.bin/eslint app components lib modules scripts` 退出 0，无输出。
- `git diff --check` 无输出；工作区仅有用户明确排除的 `.claude/launch.json` 删除。
- `npm run build`（Next 16 production build，`DATABASE_URL` 指向隔离库）退出 0，本机耗时 27 秒；构建后无 tracked 文件被改写（含 Next 自动生成的 AGENTS 规则块）。这是本地构建，不等于生产受限构建（生产实测约 120–134 秒），本轮未发布。

## 6. 浏览器验收（本轮实际执行）

- 方式：headless Chrome 154 + CDP（`Page.navigate` + `Network.setCookie` + `Runtime.evaluate` + `Page.captureScreenshot`），夹具建在隔离库：1 位老板（含有效会话）、1 家分公司、1 个抖音账号（实名人、中控）、1 部手机、1 个手机号、1 个卡槽关系、1 条手机—账号登录关联。
- 断言与结果：`/accounts` 表头含“实名人/所在手机”、不含“分公司/运营”，且渲染出实名人值与手机编号；`/resources/numbers` 表头含“所在手机”、不含“分公司”，渲染出编号与“卡槽 1”；`/boss` 概览正常；`/live-reports?view=monetization` 标题为打粉视图。四项均通过。
- 截图证据（临时，不提交）：`/tmp/manager-review-1001/browser/accounts.png`、`numbers.png`、`boss.png`、`monetization.png`。
- 覆盖边界：仅这 4 页与列表列结构；不是所有角色、所有入口、窄屏、真实拖动排序的完整目视验收，K006/K007/K014 仍然有效。

## 7. 权限与安全只读审计

只读审计（未连库、未改文件）结论：

- 18 个写服务均具备“共享事务锁 → 锁内会话/岗位复核 → version 校验 → `writeAudit` 同事务审计”四项；35 处 `writeAudit` 中只有登录失败审计（`modules/auth/actions.ts`）在事务外，属有意设计。
- 未发现以 `actor.role` 单独比较作为授权判断；岗位判断走 `hasRole`/`userRoles`/`roleWhere` 与具名能力函数。
- 未发现未鉴权的 Server Action 或 Route Handler；唯一 route handler（截图读取）先 401、再做范围校验并返回 404，且有 id 格式校验防穿越。
- 未发现硬编码凭证、客户端密钥或 `NEXT_PUBLIC_` 泄漏；`git grep postgres://` 命中的均为占位符；种子脚本无兜底默认口令。
- 会话撤销、离职、强制改密后各写路径在事务内重新按 token 查会话，未发现可继续写入的旧会话路径。

本轮登记为待办（见 known-issues.md，均未在本次修改）：

| 编号 | 级别 | 摘要 |
| --- | --- | --- |
| K004（已有） | 中 | 纯中控兼任分公司负责人时，`canManageAccountBranch`/`reportManagementScope`/`canEditWorkflow` 全部拒绝；属产品口径待确认 |
| K017 | 低 | `modules/leads/actions.ts` 入口只有会话检查，缺页面级 `requirePageUser`/`requirePasswordChanged` 守卫；服务层仍会拒绝，属纵深防御 |
| K018 | 低 | `lib/db.ts`、`lib/audit.ts`、部分 `modules/*/service.ts|data.ts` 未 `import "server-only"`；当前无客户端引用，属纵深防御 |
| K019 | 低 | `mustChangePassword` 被查询并传入 `AccountForm`/`ResourceForm`，客户端组件实际未使用，属多余下发 |
| K020 | 低 | `Branch` 无 `version` 列，改名/启停无版本保护，依赖 advisory lock 串行化与审计留痕 |

## 8. 依赖审计（K012 更新）

`npm audit --omit=dev`（2026-09-30 实测）：7 项，5 high / 2 moderate。

| 包 | 级别 | 传递路径 |
| --- | --- | --- |
| brace-expansion | high | shadcn → ts-morph → @ts-morph/common → minimatch |
| deepmerge-ts | high | @prisma/client → prisma → @prisma/config |
| mysql2 | high | @prisma/client → prisma |
| @prisma/config | high | 由 deepmerge-ts 计数 |
| prisma | high | 由 @prisma/config、mysql2 计数 |
| fast-uri | moderate | @prisma/client → prisma → @prisma/dev → @prisma/streams-local → ajv |
| ip-address | moderate | shadcn → @modelcontextprotocol/sdk / socks |

判断边界：应用运行时使用 PostgreSQL（`@prisma/adapter-pg` + `pg`），`mysql2` 属 Prisma CLI/引擎链；`shadcn` 链属脚手架工具链。但“不在应用运行路径”需要代码级可达性分析才能定论，本轮只记录事实与路径。`npm audit fix --force` 会把 Prisma 降到 6.19.3 的主版本变更，未执行。

## 9. 生产只读核验

| 项目 | 本轮实测 |
| --- | --- |
| 服务 | `systemctl is-active manager nginx docker` 均 active |
| 定时器 | `manager-backup.timer`、`manager-cert-renew.timer` 均 active；备份 09-30 03:00 CST 成功退出；续期任务 09-30 00:05、12:10 CST 均秒级成功退出（多为无需续签的成功退出，不能当作真实续签已验证） |
| 证书 | `8.163.69.11` 到期 2026-10-03 19:23:41 UTC（北京时间 10-04 03:23:41），剩余约 3 天 → K001 仍需跟踪 |
| 磁盘 | `/` 40G，已用 18G，可用 20G（48%） |
| HTTP | `https://8.163.69.11/login` 200；未登录 `/` 307 |
| 回退资产 | `standalone-before-*` 目录与 `/var/backups/manager/manager-20260930T115823Z.dump` 等备份存在 |
| 本轮动作 | 全程只读；未在生产运行测试、写入夹具、执行迁移或发布 |

## 10. 文档一致性核对与修正

本轮修正（详见同轮提交）：

- `docs/data-model.md`：迁移数 18 → 19；SQL 迁移清单补第 19 行 `20260929130000_account_ban`；核对日期更新为 2026-09-30。
- `README.md`：文档索引“18次迁移” → 19 次。
- `docs/current-status.md`、`docs/CHANGELOG.md`：09-29 文档交付的历史统计标注为当时快照，并按当前仓库重核为 24 份 Markdown、84 条本地链接（全部有效）、20 个 model、19 次迁移、41 个决定 ID、353 个字段；补本轮复查记录与生产源码清单时效说明。
- `docs/decisions.md`：决策索引并入 D036–D041；最后更新日期改为 2026-09-30。
- `docs/known-issues.md`：K012 更新为 7 项并列出传递路径；新增 K017–K020；更新 K006/K014 的本轮浏览器覆盖；日期戳更新。
- `docs/architecture.md`：路由表补 `/live-reports?view=monetization` 双视图说明；核对日期更新为 2026-09-30。
- `docs/README.md`：专项速查补本报告链接。

一处被误判为冲突、经生产证据澄清的口径：`/opt/manager/data-before-navigation-20260929.json` 实为 19 张表，`data-before-pending-20260929.json` 及其后快照为 20 张表。前者是应用 `phone_login_accounts` 迁移前的快照（旧表 19 张），后者是迁移后（20 张），两者不矛盾。09-29 迁移演练脚本报告的“19 张旧表”同理指迁移前表数。

生产源码清单时效说明：`docs/production-source-manifest-20260930.json` 是封禁发布时点的 196 文件 SHA-256 快照。此后 09-30 的三次发布（实名人、账号所在手机、手机号所在手机）各改动 1–2 个文件并各自在服务器核对 196 个部署文件哈希一致，但未回写该 manifest，因此本地重算 manifest 会有 4 个文件不一致（app/accounts/page.tsx、components/number-directory.tsx、modules/resources/data.ts、modules/accounts/data.ts）。这是清单的时间点属性，不是发布异常；如需逐文件复算最新发布，应重新生成清单。

## 11. 未覆盖与限制

- 未做全部页面、全部角色、窄屏、真实鼠标拖动排序（K007）的浏览器目视；本轮只覆盖 4 个页面。
- 未验证证书真实续签、未做异机备份与完整恢复演练（K001/K002）。
- 未做依赖漏洞的代码级可达性分析，也未执行依赖升级（K012）。
- 本轮只做本机生产构建（27 秒，未测量内存峰值，未在生产受限环境构建），不含发布；生产构建的耗时与内存数据沿用 09-30 发布记录。
- 未逐条复核历史专题文档（douyin-accounts、controller-workbench-design、lead-specialist、live-reports、resources 等）的业务描述，只做了链接与路径校验。
- 本地日常开发库 `manager` 仍停留在 5 次迁移（8 张表，2026-09-08 状态），落后 14 次迁移；本轮未迁移它，下一次本地开发前需按本机确认的连接执行 `migrate deploy`（禁止 reset/seed）。

## 12. 证据与临时文件

- 测试日志与汇总：`/tmp/manager-review-1001/summary.txt`、`/tmp/manager-review-1001/logs/*.log`。
- 浏览器截图：`/tmp/manager-review-1001/browser/*.png`（临时证据，不提交、不代表长期保留）。
- 依赖审计原始输出：`/tmp/manager-review-1001/npm-audit.json`。
- 夹具清理 SQL：`/tmp/manager-review-1001/cleanup.sql`；隔离开发服务与 headless Chrome 已停止，夹具数据已删除。
- 临时目录内容不保证长期保留；本报告记录的是实际命令、环境与结果。

## 13. 下一步

1. 产品确认 K004（中控兼分公司负责人）口径后再谈权限调整；K015（场次更正与报表时间）同属业务确认项。
2. K017–K020 属低风险加固，需用户确认后小步修改并各自补验证，本次未改代码。
3. K012 依赖可达性分析单独进行；不自动跨主版本降级。
4. K001/K002/K007/K014 继续按已知问题跟踪；浏览器验收广度按模块逐步补。
5. 需要新一轮发布时，按 operations.md 备份、旧数据摘要与源码哈希流程执行，不能引用本轮只读结果当作发布验证。
