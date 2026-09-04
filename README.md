# 公司内部管理系统

公司内部管理系统的第一个版本。技术栈：Next.js 16（App Router）+ TypeScript（strict）+ Tailwind CSS v4 + shadcn/ui + PostgreSQL 16（Docker）+ Prisma 7 + zod + bcryptjs。

## 本版功能

- 登录 / 退出 / 会话保持（数据库会话 + httpOnly cookie，7 天过期）
- 首次登录强制修改密码
- 按岗位自动跳转工作台：老板 → `/boss`，中控 → `/controller`，其他岗位 → `/wip`
- 用户管理（仅老板）：列表（搜索/筛选）、新增、编辑、离职/复职、重置密码
- 分公司管理（仅老板）：列表、新增、重命名、启用/停用
- 审计日志：登录成败、用户增改、离职复职、改密重置、分公司增改
- 登录频率限制：同 IP 15 分钟内失败 5 次锁定 15 分钟

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

- `npm audit` 报 4 个高危漏洞，全部位于 Prisma 命令行工具的依赖（`mysql2`、`deepmerge-ts`），不进应用代码；官方修复需要降级 Prisma，暂不处理。
- Prisma 的 npm `latest` 标签当前指向 8.0 RC 预发布版，本项目锁定 7.10 稳定版，不要用 `npx prisma@latest` 升级。
- 登录频率限制计数保存在进程内存里，服务重启后清零（单机部署足够，多实例时需改为数据库存储）。
