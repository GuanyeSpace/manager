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
```

## 测试数据库安全（必须遵守）

- 破坏性测试只接受 `TEST_DATABASE_URL`，缺失即退出，禁止回退到 `DATABASE_URL`。
- 测试库名必须以 `_test` 结尾且不等于日常库；连接后核对 `current_database()`。
- 必须显式设置 `ALLOW_TEST_DESTRUCTION=true`，并拒绝 `NODE_ENV=production`。
- 测试数据带唯一运行标识，只清理本次创建的数据，禁止无条件全表删除。

## 测试账号

统一测试密码见 `.env` 的 `TEST_ACCOUNTS_PASSWORD`（不入库）：`boss_test`（老板）、`controller01`（中控）、`anchor01`（主播）、`operator01`（运营，测试残留，可在 UI 里设为离职）。老板真实账号 WangGuanye 密码由老板本人保管。

## 本版明确不做

抖音账号管理、主播、直播间、直播场次录入、SOP、任务管理、财务、资产管理、报表图表、短信/微信登录、密码找回、上传头像、国际化、深色模式、自定义角色权限配置界面、审计日志查看页面（当前只写入）。
