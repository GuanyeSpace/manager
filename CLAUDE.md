@AGENTS.md

# manager — 公司内部管理系统

内部管理系统 v1。技术栈已定，不要替换或自行加库。

## 技术栈

- Next.js 16（App Router）+ TypeScript（strict）+ Tailwind CSS v4 + shadcn/ui
- PostgreSQL 16（本地 Docker，端口 **5433**，勿用 5432——被本机原生 PostgreSQL 占用）
- Prisma ORM **7.10**（锁定此大版本：npm 的 latest 标签指向 8.0 RC，勿用 `npx prisma@latest`）
- 认证：自建会话（数据库存 Session + httpOnly cookie），不用 JWT、不用第三方 SaaS
- 密码哈希 bcryptjs；输入校验 zod（前后端都要校）

## 目录结构

- `app/` — 路由与页面（页面只做组装、守卫调用与跳转，不放业务逻辑）
- `modules/<域>/` — 按业务域组织：`schema.ts`（zod 校验）、`actions.ts`（server actions）、`queries.ts`（数据查询）
- `lib/auth/` — `session.ts`（会话）、`permissions.ts`（能力检查与页面守卫）、`session-token.ts`（cookie 签名）、`role-labels.ts`、`rate-limit.ts`
- `lib/` — `db.ts`（Prisma 单例，唯一数据库入口）、`audit.ts`、`datetime.ts`、`request-ip.ts`
- `components/` — 共享 UI 组件（shadcn 基础组件在 components/ui/）
- `prisma/` — schema、迁移、seed
- `proxy.ts` — 路由粗拦截（Next 16 把 middleware 改名 proxy）

## 已定约定（新代码必须遵守）

1. **每张业务表必带 branchId**，分公司之间数据完全隔离；老板 branchId=null 表示跨分公司。
2. **金额一律整数（分）存储**，禁止浮点数存钱。
3. **时间一律存 UTC**，给人看的时间用 `lib/datetime.ts` 的 `formatDateTime`（转 Asia/Shanghai）。
4. **权限必须在服务端强制执行**：
   - 页面第一行调用 `lib/auth/permissions.ts` 的守卫（requireBossPage / requirePageUser 等）；
   - 每个 server action、查询函数必须**再次独立**断言能力（assertCanManageUsers 等），不得假设页面或 proxy 已经拦过；
   - 禁止在业务代码里散写 `role === "BOSS"` 之类比较，一律封装为具名能力函数；
   - 前端隐藏菜单/按钮只是体验，不是防线。
5. **不物理删除用户**：离职 = employmentStatus RESIGNED（立即删其全部会话），可复职；**系统必须至少保留一个在职 BOSS**；老板不能离职自己、不能把自己的岗位改成非 BOSS。
6. **新建用户 mustChangePassword 一律 true**；老板重置密码后也置 true 并删除该用户全部会话。
7. **密码绝不落日志、源码、示例、版本库**；`.env` 不入库（`.env.example` 入库存模板）。
8. **审计日志只通过 `lib/audit.ts` 的 writeAudit 写入**，禁止直接 prisma.auditLog.create；用户/分公司/密码等关键写操作必须把 writeAudit 放进同一事务并传入 `db`，保证业务与审计原子提交。
9. 错误信息不得向前端泄露数据库结构或堆栈；Prisma P2002（唯一冲突）要转成友好提示。
10. Prisma 客户端生成到 `app/generated/prisma/`（gitignore，不入库）；改 schema 后跑 `npx prisma migrate dev`。
11. **改密/重置会话撤销**：普通改密必须验证旧密码；是否强制改密只信数据库 `mustChangePassword`；所有改密/重置都撤销该用户其他会话并为当前浏览器签发新会话，且与新密码、审计在同一事务里完成（事务提交后再写 cookie）。
12. **登录限流分层**：账号+IP、IP 失败总量、账号跨 IP 退避三层，阈值集中在 `lib/auth/rate-limit.ts`；计数窗口与锁定期分离，锁未到期不因窗口过期被清；不存在的用户名也受限流；限流键与登录的 username 匹配规则一致（当前区分大小写，不要擅自改）。
13. **客户端 IP 信任**：只有 `TRUST_PROXY=true` 才信任 `x-forwarded-for` / `x-real-ip`；默认归入 `direct` 桶。生产接反向代理时必须让代理覆盖转发头并禁止直连应用端口。
14. **在职老板不变量**：所有岗位/在职状态写入先取 `pg_advisory_xact_lock`，再在事务内重读操作者与目标的最新状态（不依赖事务外快照），禁止回到「先 count 再 update」；操作者被并发降岗/离职时拒绝其过期修改。
15. 岗位中文名：`CONTROLLER`=中控、`ASSISTANT`=小助理（枚举值不变）。
16. **创建用户/重置密码的事务内授权**：与降岗/离职同用管理 advisory lock，锁内重读操作者（角色+在职+mustChangePassword）及当前会话；先管理锁、再用户行锁，避免死锁；分公司校验放进事务内业务流程。

## 常用命令

```bash
npm run dev                    # 开发服务器
npm run build / lint / typecheck
docker compose up -d           # 启动数据库（先准备 .env）
npx prisma db seed             # 种子数据（幂等）
npx prisma studio              # 数据库图形界面
npx prisma migrate dev         # 改 schema 后同步结构
npm run test:rate-limit        # 限流逻辑回归（无数据库）
npm run test:db-protection     # 破坏性测试保护校验（无数据库）
npm run test:concurrency       # 在职老板不变量并发测试（需 TEST_DATABASE_URL + ALLOW_TEST_DESTRUCTION）
npm run test:auth-concurrency  # 登录/改密/重置/离职并发一致性（需隔离测试库）
npm run test:auth-overlap      # 真实数据库锁竞争（双连接 + barrier，需隔离测试库）
npm run test:auth-overlap-fault # 锁竞争测试故障路径（无阻塞/事务报错清理）
```

## 测试数据库安全（必须遵守）

- 破坏性测试只接受 `TEST_DATABASE_URL`，缺失即退出，禁止回退到 `DATABASE_URL`。
- 测试库名必须以 `_test` 结尾且不等于日常库；连接后核对 `current_database()`。
- 必须显式设置 `ALLOW_TEST_DESTRUCTION=true`，并拒绝 `NODE_ENV=production`。
- 测试数据带唯一运行标识，只清理本次创建的数据，禁止无条件全表删除。

## 测试账号

统一测试密码见 `.env` 的 `TEST_ACCOUNTS_PASSWORD`（不入库）：`boss_test`（老板）、`controller01`（中控）、`anchor01`（主播）、`operator01`（运营，测试残留，可在 UI 里设为离职）。老板真实账号 WangGuanye 密码由老板本人保管。

## 阶段 1 基线与验收状态（基线：0ef5e84）

### 已交付范围

- 用户名 + 密码登录、会话保持与退出；首次登录强制修改密码。
- 按岗位路由：老板 → `/boss`，中控 → `/controller`，其他岗位 → `/wip`。
- 老板工作台、中控工作台（空壳）；用户管理与分公司管理（仅老板可用）。
- 自建会话认证（数据库 `Session` + httpOnly cookie），bcryptjs 密码哈希，审计日志写入。

### 认证、会话撤销、权限与并发一致性修复

- 登录、本人改密、老板重置密码、离职在事务内锁行复核并撤销旧会话。
- 创建用户、重置密码、岗位/在职变更统一使用管理 advisory lock，事务内重读操作者与会话。
- 至少保留一个在职老板的不变量；操作者被并发降岗/离职时拒绝其过期修改。
- 分层登录限流（账号+IP / IP 失败总量 / 账号跨 IP 退避），锁定期与计数窗口分离。
- 测试库保护（`TEST_DATABASE_URL` + 库名白名单 + `current_database()` 核对 + 唯一标识清理）。
- 并发测试用 `pg_backend_pid()` + `pg_blocking_pids()` 确认真实数据库锁等待。

### 测试结果区分

- Claude 实际执行并通过：`lint`、`typecheck`、`build`、限流回归、测试库保护、用户管理并发、认证并发、真实锁竞争、故障路径测试，以及 HTTP 回归。
- 外部静态代码复核：已完成一轮针对认证/权限/并发实现的静态审查，属于人工/工具复核结论，不等于生产安全认证，也不代表所有漏洞已消除。

### 非阻塞测试工具待办

- 主测试成功但清理失败时，应明确报告清理失败，避免无条件输出 `ALL PASS`；已有主错误时保留原错误并附加清理错误。
- 进一步验证观察查询取消、原事务超时后连接释放的实际行为；不能把 Promise 超时或调用 `disconnect` 等同于已证实的数据库强制回滚。

### 生产部署前独立验收

- HTTPS 与可信反向代理；禁止客户端绕过代理直连应用端口。
- 生产密钥与数据库连接串管理；备份与恢复演练。
- 生产构建（`next build` / `next start`）与部署回归。

### 下一阶段待老板确认

- 抖音账号字段与负责人交接规则等待老板确认，禁止自行补需求开发。

## 本版明确不做

抖音账号管理、主播、直播间、直播场次录入、SOP、任务管理、财务、资产管理、报表图表、短信/微信登录、密码找回、上传头像、国际化、深色模式、自定义角色权限配置界面、审计日志查看页面（当前只写入）。
