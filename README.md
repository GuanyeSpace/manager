# 公司内部管理系统

公司内部管理系统的第一个版本。技术栈：Next.js 16（App Router）+ TypeScript（strict）+ Tailwind CSS v4 + shadcn/ui + PostgreSQL 16（Docker）+ Prisma 7 + zod + bcryptjs。

## 本版功能

- 登录 / 退出 / 会话保持（数据库会话 + httpOnly cookie，7 天过期）
- 首次登录强制修改密码
- 按岗位自动跳转工作台：老板 → `/boss`，中控 → `/controller`，其他岗位 → `/wip`
- 用户管理（仅老板）：列表（搜索/筛选）、新增、编辑、离职/复职、重置密码
- 分公司管理（仅老板）：列表、新增、重命名、启用/停用
- 审计日志：登录成败、用户增改、离职复职、改密重置、分公司增改
- 登录频率限制：分层（账号+IP / IP 总量 / 账号跨 IP 退避），避免单人输错封住全公司出口 IP

## 从零启动（第一次使用，按顺序执行）

前置条件：macOS，已安装 Docker Desktop（从 docker.com 下载并启动）。以下命令都在项目根目录执行。

### 1. 创建自己的配置文件

```bash
cp .env.example .env
```

然后打开 `.env`，把 `SEED_BOSS_PASSWORD` 改成老板账号的初始密码（首次登录会被强制修改，所以随便设一个即可，注意至少 8 位），`SESSION_SECRET` 用下面的命令生成一段随机值填进去：

```bash
openssl rand -hex 32
```

`.env` 不会被提交到 git（已在 .gitignore 里）。

### 2. 启动 PostgreSQL 数据库

```bash
docker compose up -d
```

首次运行会自动下载 PostgreSQL 16 镜像。验证：`docker compose ps` 显示 `manager-db` 为 `healthy`。

> 注意：数据库用 **5433** 端口。这台机器的 5432 端口被一个原生 PostgreSQL（Homebrew 安装的）占用，本项目不去动它。

### 3. 安装依赖并初始化数据库结构

```bash
npm install
npx prisma migrate dev
```

`migrate dev` 会创建数据表并生成 Prisma 客户端代码（生成到 `app/generated/prisma/`，不入库）。

### 4. 写入种子数据（分公司 + 老板账号）

```bash
npx prisma db seed
```

幂等：重复执行不会重复插入，也不会重置老板已改过的密码。

### 5. 启动开发服务器

```bash
npm run dev
```

浏览器打开 http://localhost:3000 ，用 `WangGuanye` + 你在 `.env` 里设的初始密码登录，按提示修改密码后进入系统。

### 停止 / 重新启动数据库

```bash
docker compose stop      # 停止（数据保留在磁盘上）
docker compose start     # 重新启动
docker compose down      # 删除容器（数据卷仍在，数据不丢）
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建（含 TypeScript 检查） |
| `npm run lint` / `npm run typecheck` | 代码检查 / 类型检查 |
| `npx prisma db seed` | 写入种子数据（可重复执行） |
| `npx prisma studio` | 打开数据库图形界面 |
| `npx prisma migrate dev` | 修改 schema 后同步数据库结构 |
| `npx prisma generate` | 重新生成 Prisma 客户端代码 |

## 项目约定（新功能开发必须遵守）

这些约定也记录在仓库根目录 `CLAUDE.md`，写代码前先读它。要点：

1. **branchId 必带**：以后每张业务表都要带 `branchId`，分公司之间数据完全隔离；老板为 null 表示跨分公司。
2. **金额用整数（分）存储**：本版暂无金额，将来一律以分为单位的整数，禁止用浮点数存钱。
3. **时间存 UTC、显示转 Asia/Shanghai**：展示用 `lib/datetime.ts` 的 `formatDateTime`。
4. **权限写在后端**：页面守卫 + 每个 server action / 查询函数独立断言（集中在 `lib/auth/permissions.ts`），前端隐藏菜单只是体验不是防线。
5. **不物理删除用户**：离职 = `RESIGNED` 状态，可复职；系统至少保留一个在职老板。
6. **密码绝不落日志、源码、版本库**；`.env` 不入库。
7. **审计日志只通过 `lib/audit.ts` 写入**。

## 测试账号

开发测试用（统一测试密码见 `.env` 的 `TEST_ACCOUNTS_PASSWORD`）：

| 用户名 | 姓名 | 岗位 | 说明 |
| --- | --- | --- | --- |
| WangGuanye | 王冠业 | 老板 | 你自己的账号（密码是你自己设的） |
| boss_test | 测试老板 | 老板 | 开发测试用，可在用户管理里设为离职 |
| controller01 | 王中控 | 中控 | 测试用 |
| anchor01 | 王主播 | 主播 | 测试用（登录后进占位页） |
| operator01 | 张三丰 | 运营 | 测试用（密码已被重置过，首次登录强制改密） |

## 已知问题

## 认证与会话安全

- 会话：数据库存 `Session` + httpOnly cookie，签名只防伪造，真实登录状态以数据库为准；7 天过期。
- 改密：普通改密必须验证旧密码；强制改密（首次/重置后）不要求旧密码，是否强制由服务端数据库里的 `mustChangePassword` 决定，客户端无法伪造。所有改密都会撤销该用户其他设备的旧会话，并为当前浏览器签发新会话；新密码不能与当前密码相同。
- 重置密码：老板重置他人密码会撤销其全部会话，下次登录强制改密；密码更新与旧会话撤销在同一事务里完成。
- 审计原子性：用户/分公司/密码等关键写操作与成功审计记录在同一数据库事务提交，任一步失败都会回滚，不会出现「业务成功但审计缺失」。
- 在职老板不变量：降岗或离职老板前用数据库 advisory lock 串行化「计数 + 写入」，避免两个老板并发互相降岗/离职后出现 0 个在职老板。

## 登录限流

百人规模、共享出口 IP 场景下的分层策略（阈值集中在 `lib/auth/rate-limit.ts`）：

- 账号 + IP：同一账号从同一来源连续失败 **5 次**锁 **15 分钟**。
- IP 总量：同一来源所有账号失败总数达 **50 次**锁 **15 分钟**（较宽松，防批量扫号，不因个别员工手误封出口）。
- 账号跨 IP：同一账号跨来源失败采用渐进退避：**10 次锁 1 分钟 → 20 次锁 5 分钟 → 40 次锁 30 分钟**，避免轻易被恶意锁死账号。

限制：计数在进程内存里，服务重启即清零，多实例不共享；达到容量上限会按「先过期、再最旧」淘汰。当前不为此引入 Redis。

## 反向代理与客户端 IP 信任

Next.js App Router 的 server action 拿不到原始 socket 地址，只能看到请求头；`x-forwarded-for` / `x-real-ip` 客户端可以伪造。

- 默认 `TRUST_PROXY=false`：不信任这些头，所有直连请求归入同一个桶，无法按 IP 精确区分，但能防伪造头绕过限流。
- 部署到 NAS + 反向代理时：设置 `TRUST_PROXY=true`，并确保反向代理「覆盖」（不是追加）`x-forwarded-for`，同时**禁止客户端绕过代理直连应用端口**。否则攻击者仍可伪造 IP。

## 测试

```bash
# 纯内存限流逻辑（无需数据库/服务，使用可注入假时间）
npm run test:rate-limit

# 破坏性测试保护（纯校验，无需数据库）
npm run test:db-protection

# 隔离测试库准备（库名必须以 _test 结尾）
docker exec manager-db createdb -U manager manager_test   # 首次执行一次
TEST_DATABASE_URL="postgresql://manager:<密码>@localhost:5433/manager_test?schema=public" npx prisma migrate deploy

# 并发「至少保留一个在职老板」不变量 + 登录/改密/重置/离职并发一致性
# 必须显式设置 ALLOW_TEST_DESTRUCTION=true；测试只清理本次运行创建的数据。
TEST_DATABASE_URL="postgresql://manager:<密码>@localhost:5433/manager_test?schema=public" \
  ALLOW_TEST_DESTRUCTION=true npm run test:concurrency
TEST_DATABASE_URL="postgresql://manager:<密码>@localhost:5433/manager_test?schema=public" \
  ALLOW_TEST_DESTRUCTION=true npm run test:auth-concurrency
```

破坏性测试保护：只有 `TEST_DATABASE_URL`（库名 `_test` 结尾、且不等于日常库）+ `ALLOW_TEST_DESTRUCTION=true` + 非生产环境时才会连接并执行；连接后还会用 `current_database()` 核对实际库名，防止误删。

## 已知问题

- `npm audit` 报 4 个高危漏洞，全部位于 Prisma 命令行工具的依赖（`mysql2`、`deepmerge-ts`），不进应用代码；官方修复需要降级 Prisma，暂不处理。
- Prisma 的 npm `latest` 标签当前指向 8.0 RC 预发布版，本项目锁定 7.10 稳定版，不要用 `npx prisma@latest` 升级。
- 登录频率限制计数保存在进程内存里，服务重启后清零（单机部署足够，多实例时需改为数据库存储）。
