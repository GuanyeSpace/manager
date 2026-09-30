# manager — 所有 AI 的开发与交接要求

本系统已正式使用。先读 [docs/README.md](docs/README.md) 和 [docs/current-status.md](docs/current-status.md)，再读当前业务、决策与目标代码。不能仅凭旧聊天或历史阶段文档开发。

## 1. 先思考再修改

- 明确需求、假设、范围和成功条件；有多种业务解释时说明并询问，不静默猜测。
- 多步任务给简短计划，每步有可验证结果。用户要求先讨论时，仅讨论和记录决定。
- 优先最简单的可行实现；只改任务必需内容，不夹带无关重构、清理或依赖升级。
- 保留已有未提交修改。发现无关问题只登记，未经确认不扩展本次范围。

## 2. 正式数据与权限

- 禁止清库、reset、seed正式库、用测试数据覆盖正式资料。新增迁移兼容旧数据，先隔离验证。
- 上线前备份数据库和截图，核对旧字段数据，保留上一版程序；按 [运维手册](docs/operations.md) 执行。
- 每次发现问题小步修改并验证；不能为了方便删除旧字段、流程快照、截图或职责历史。
- 权限在查询和写服务分别强制执行；多岗位用共同能力函数，不只比较User.role。
- 具体事务、锁、审计与测试约束见 [开发规范](docs/development-guide.md)；不得擅自弱化。

## 3. 文档必须与进度、决策同步（用户明确要求）

**每次形成新决定、改变进度、完成验证、暂停或发布，必须在同一次工作中更新项目文档。** 不得只在最终回复中说明，也不得依赖AI个人记忆。

- 任务开始/里程碑/暂停/完成：更新 [current-status.md](docs/current-status.md) 的当前任务、已完成、剩余、验证与部署状态，并追加 [CHANGELOG.md](docs/CHANGELOG.md)。
- 业务决定：追加或更新 [decisions.md](docs/decisions.md)，同步 [business-rules.md](docs/business-rules.md)；旧决定标明被替代，不留互相冲突的“当前规则”。
- 数据或结构变更：同步 [data-model.md](docs/data-model.md)、[字段速查](docs/data-dictionary.md)、[architecture.md](docs/architecture.md) 相关条目。
- 发现问题：更新 [known-issues.md](docs/known-issues.md)，区分已复现、推测、待确认；修复后补验证证据。
- 实际发布/运维修复：更新 [deployment.md](docs/deployment.md)、[operations.md](docs/operations.md) 中适用内容，记录真实备份、迁移、健康与回退信息。
- 交接前：明确已上线/仅本地、运行中的进程、未完成步骤和需要用户提供的信息；不写笼统“继续优化”。
- 不虚报验证。旧日志通过不等于本次重测，HTTP成功不等于浏览器验收，timer启用不等于续期成功。
- 不在文档保存密码、私钥、Cookie、会话token或完整连接串。模板见开发规范。

完成标准包括代码/文档一致、链接有效、测试证据真实、待办明确。纯文档变更不必构建或部署生产系统；应验证文档本身。

## 4. 每次更新必须提交并同步远程（用户明确要求）

- 远程仓库：`https://github.com/GuanyeSpace/manager.git`，remote为`origin`，主分支`main`。
- 每次完成代码、配置、决策或文档更新，先完成适用验证和文档同步，再审查差异与敏感信息，按明确文件清单提交并推送对应远程分支。不要只留在本地；不因既有授权重复询问是否推送。
- 推送前fetch并检查分支关系；禁止force push、重写他人提交或为同步丢弃本地改动。遇到远程分叉先检查差异，不能安全合并时说明阻碍。
- 不能使用无审查的`git add .`；环境文件、密钥、Cookie、数据库备份、截图、构建/生成/临时产物不得提交。保持.gitignore保护。
- `.claude/launch.json`的本地删除已明确排除，未经新指示不要恢复或提交此删除。
- 推送后核对远程提交与本地一致；失败时明确记录已提交未推送及原因，不宣称完成同步。Git推送与生产部署是两件事，分别报告状态。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
