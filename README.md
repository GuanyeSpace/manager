# 星熠传媒内部管理系统（manager）

用于分公司、员工、抖音账号、直播执行、导粉统计及资源资产管理。已正式上线使用，任何改动必须保护原有业务数据。

**AI接手先读 [AGENTS.md](AGENTS.md) 和 [完整文档入口](docs/README.md)。** 当前进度、决策、待办与发布事实都保存在项目内；完成开发时必须同步更新。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [当前进度](docs/current-status.md) | 已上线功能、最近验证、当前任务、下一步、工作区状态 |
| [当前业务规则](docs/business-rules.md) | 岗位权限、中控执行、导粉认领、数据口径、物资关系 |
| [开发决策](docs/decisions.md) | 已确认决定、理由、被替代方案、新增决定模板 |
| [架构地图](docs/architecture.md) | 路由、服务、组件、权限、事务和导航 |
| [数据模型](docs/data-model.md) | 20个模型、关系、JSON、单位、18次迁移 |
| [开发规范](docs/development-guide.md) | 本地启动、隔离测试、验证和文档更新要求 |
| [运维手册](docs/operations.md) | 生产位置、构建、备份、发布、恢复 |
| [发布记录](docs/deployment.md) | 每次实际上线证据及历史问题 |
| [已知问题](docs/known-issues.md) | 需复核的实现边界、验收缺口、后续候选 |
| [变更日志](docs/CHANGELOG.md) | 开发里程碑与最新文档交付 |

## 当前功能

- 组织、员工、多岗位、分公司负责人、登录/改密/离职与会话撤销。
- 抖音账号、三类负责人、跨公司调拨和历史快照。
- 直播中控：上班、设备检查、账号准备、秒级/口令事项、异常与截图、收尾和更正。
- 导粉专员：按真实场次认领，直播/打粉数据草稿、完成、更正、回收站与修改记录。
- 账号专属流程/话术、复制与批量配置；主播与多直播间关联。
- 手机号主副卡/套餐/多平台绑定，手机双卡槽和独立实际登录账号，设备/物资数量、成本/估值、单件标签。
- 管理侧栏、顶部工作台切换、关联详情逐级返回、手机号/手机10/20/50分页。

纯直播中控不查看统计数据；兼任导粉通过额外授权查看本人认领数据。没有自动抖音登录/采集/发卡，也没有正式收入结算。

## 技术栈

Next.js16.3.4 App Router、React19.2.8、TypeScript、TailwindCSS4、shadcn/ui、PostgreSQL16、Prisma7.10、zod、bcryptjs。依赖以package-lock.json为准；不擅自替换技术栈或升级主版本。

## 本地开发

先按 .env.example 配置本地 .env（不提交），确认 DATABASE_URL 是本地开发库。数据库映射5433，避免占用本机已有5432服务。

```bash
npm ci
docker compose up -d
./node_modules/.bin/prisma migrate deploy --config prisma7.config.ts
./node_modules/.bin/prisma generate --config prisma7.config.ts
npm run dev
```

已有正式数据不得seed/reset。全新本地空库的初始化另行确认，勿把本地初始化步骤用于生产更新。隔离测试必须使用TEST_DATABASE_URL和显式许可，详见[开发规范](docs/development-guide.md)。

常用检查：npm run typecheck、npm run lint及受影响模块测试。Next.js相关开发前阅读node_modules/next/dist/docs/对应指南。

## 正式运行

最近发布地址：https://8.163.69.11 。数据持久化在PostgreSQL与私有截图目录，生产配置和SSH私钥不进入仓库。每次发布先备份，增量迁移核对旧数据，保留可恢复程序。仅允许使用受限构建或本地Linux构建，详见[运维手册](docs/operations.md)。

## 文档持续维护

每次决定/进度改变，同轮更新current-status和CHANGELOG；业务决定更新decisions与business-rules；结构/接口更新模型与架构；实际发布追加deployment。未完成任务要留下具体停点和验证范围。规则写在AGENTS.md，任何接手AI都应执行，不依赖聊天历史或个人记忆。
