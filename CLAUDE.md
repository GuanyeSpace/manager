@AGENTS.md

# manager 项目协作入口

本文件供读取CLAUDE.md的开发工具使用；规则同样适用于所有AI。

1. 首先阅读 [项目文档入口](docs/README.md)、[当前状态](docs/current-status.md)、[有效业务规则](docs/business-rules.md)。
2. 开发前查 [决策](docs/decisions.md)、[架构](docs/architecture.md)、[数据模型](docs/data-model.md) 和目标代码。
3. 遵循 [开发与测试规范](docs/development-guide.md)；发布遵循 [运维手册](docs/operations.md)。
4. 每次决定、进度、验证或部署变化必须同轮更新对应文件。不要把聊天回答当成项目记录。

每次完成更新须按AGENTS.md审查、提交并推送origin对应分支（主分支main），核对远程结果；这不等同于生产部署。

## 必须保留的工程约束

- 正式库禁止重置、清空、seed、测试造数据；只做兼容旧数据的增量迁移，小步修改。
- Next16版本差异先查本地官方文档；Prisma用锁定7.10，不用latest。数据库5433；金额通常整数分，历史GMV Decimal元例外见模型文档。
- UTC存储，Asia/Shanghai展示。分公司数据范围在服务端约束；部分历史表通过父关系隔离，并非全部有branchId字段。
- 岗位按role+roles合集，用具名权限函数；页面、查询、动作各自校验，前端隐藏不算授权。
- 管理写操作沿用共享事务锁、锁内会话/岗位复核、version保护和writeAudit同事务记录。
- 用户不物理删除，离职撤销会话；至少一位在职老板，老板不能自行撤销老板资格。
- 密码、Cookie、私钥、SESSION_SECRET与真实连接串不得进入日志、文档或版本库。
- 测试只用隔离_test库，TEST_DATABASE_URL + ALLOW_TEST_DESTRUCTION=true，禁止生产环境；迁移命令读取的是DATABASE_URL，须明确区分。
- 保护已有未提交文件，不用reset/clean回到旧HEAD；Git已建立生产源码基线，具体范围和最新状态见current-status.md。

旧阶段记录保存在 [历史CLAUDE说明](docs/history/CLAUDE-before-handoff.md)，不得将其中“中控空壳”“中控填数据”“尚未上线”当成当前事实。
