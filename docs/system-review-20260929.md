# 2026-09-29 全系统测试与逻辑检查

## 结论与范围

现有21个顶层测试脚本均完成本轮运行，另有3个直播提醒组件测试通过。覆盖认证、组织、多岗位、账号、直播执行、导粉填报、资源及数据迁移。发现分公司写入的权限时序缺口，已小步修复并新增专项验证。**修复仅在本地，未构建发布到生产。正式库无测试写入，无结构迁移。**

这是现有自动化测试全跑、重点代码边界检查和部分浏览器操作核验，不能理解为所有角色、每个页面、每种组合都已人工验收，更不能保证不存在漏洞。业务取舍、运维风险及未覆盖项列在下文。

## 本轮测试矩阵

所有破坏性测试仅用本机manager_accounts_test或迁移专项临时库；入口校验本地主机、_test库名及显式测试开关。共库脚本顺序执行。

| 脚本（scripts/下） | 结果/主要验证 |
| --- | --- |
| test-rate-limit.ts | 通过；登录限流 |
| test-db-protection.ts | 通过；误库与破坏性测试保护 |
| test-boss-invariant.ts | 通过；最后老板保护及并发 |
| test-auth-concurrency.ts | 通过；认证并发 |
| test-auth-overlap.ts | 通过；会话交错 |
| test-auth-overlap-fault.ts | 故障注入断言通过；会记录预期清理错误，不能据此认为公共清理失败会非零退出，见K009 |
| test-accounts.ts | 通过；账号职责、调拨、历史及权限 |
| test-live-reports.ts | 通过，含HTTP；指标、权限、删除及审计 |
| test-workbench.ts | 通过，含HTTP；执行、快照、权限及待补判断 |
| test-work-shifts.ts | 通过；上班、每日检查、单场执行约束 |
| test-work-evidence.ts | 通过，含HTTP；截图归属、下载授权及拒绝 |
| test-work-corrections.ts | 通过，含HTTP；收尾后更正及审计 |
| test-resources.ts | 通过，含HTTP；主播、直播间、物资、手机与设备关联 |
| test-number-management.ts | 通过，含HTTP；主副卡、套餐、卡槽并发、筛选分页 |
| test-leads.ts | 通过，含HTTP；认领竞态、多场、草稿与零值、完成、回收站、跨分公司权限、审计回滚 |
| test-multi-roles.ts | 通过，含HTTP；多岗增撤、兼任双工作台、跨房间导粉、单中控限制 |
| test-phone-navigation.ts | 通过，含HTTP；逐级返回、安全来源、10/20/50、独立登录账号、换卡保留 |
| test-lead-migration.ts | 通过；18张旧表原列保持、旧场次排除自动认领 |
| test-role-migration.ts | 通过；19张旧表原列保持、员工旧岗位保留 |
| test-phone-migration.ts | 通过；19张旧表原列保持、不推断实际登录账号 |
| test-branches.ts（新增） | 通过；增改启停、真实锁等待期间撤销会话、撤岗/离职/强制改密拒绝、审计与事务回滚 |

`components/work-live-clock.test.ts`：3个测试通过。全项目typecheck及app/components/lib/modules/scripts范围eslint（排除生成代码）通过；最后分公司改动再次typecheck和相关eslint通过；git diff --check通过。

## 确认并修复的问题

### K016 分公司写入缺少事务内身份复核

原create/rename/toggle只在进入action时检查老板权限。身份通过检查后，如果会话撤销或岗位变化与请求交错，缺少管理锁和事务内复核；rename/toggle还在事务外读取旧状态，可能形成过时的审计前值。

新增modules/branches/service.ts统一在事务内获取现有管理锁，再复核会话、在职状态、强制改密和老板能力，读取当前分公司后写入并记录审计。actions保留入口守卫。没有增加权限，没有修改数据库结构。

测试通过数据库pg_blocking_pids确认写请求确实等待管理锁；锁持有方撤销会话后释放，等待请求被拒绝，分公司及审计不变。正常三种操作和异常回滚也通过。浏览器隔离账号完成登录、新增、重命名、停用，最终显示新名称及已停用。截图为`/tmp/manager-review-branch.png`（临时证据）。

### 分页脚本旧假设

手机号默认页数已改20，但旧HTTP测试用约12条数据仍要求出现下一页。修改test-number-management.ts显式请求pageSize=10，保留原分页测试意图。默认20及10/20/50另由phone-navigation覆盖。不是线上分页故障。

## 本轮遇到的环境情况

- 第一轮截图HTTP测试因WORK_SCREENSHOT_DIR不在系统临时目录触发安全断言。改隔离服务配置为/tmp/manager-review-screenshots后重跑通过，未放宽安全断言。
- 本地浏览器127.0.0.1触发Next开发资源跨来源拒绝，换localhost后登录及分公司操作通过，未修改生产允许来源。
- 浏览器夹具等待输入进程已退出，未执行自动finally；使用相同前缀、相同测试库保护和原清理顺序定向清理，执行成功。禁止把此临时夹具当生产数据。
- pg驱动出现同一client重叠query的弃用提示，现有断言通过；尚未定位到具体调用点，后续升级驱动前排查，不能归类为当前业务失败。

## 仍需处理/讨论

| 问题 | 结论与下一步 |
| --- | --- |
| K004 中控兼分公司负责人 | 部分管理能力可能被执行岗位限制覆盖；需明确负责人权限是否覆盖中控限制，未擅改权限 |
| K015 更正场次时间与报表时间 | 当前两者独立，可能不一致；需确认是否联动历史报表，涉及唯一键与审计 |
| K001 短期IP证书 | 当前有效，续期服务近期成功不代表真实续签已成功；需持续确认下一次实际证书更新 |
| K002 同机备份 | 不能防整机丢失；需异机存储及完整恢复演练 |
| K009 公共测试清理 | 存在清理错误只打印、退出仍成功的路径，仍待独立修复 |
| K006/K007/K014 人工验收广度 | 多岗位双工作台全链路、真实拖动、窄屏与全部返回组合仍未全覆盖；自动化通过不能替代 |
| K012 依赖审计 | 本次npm audit --omit=dev报告4个high包：prisma、@prisma/config、deepmerge-ts、mysql2；含传递计数，不是4个独立可利用入口。依赖链为@prisma/client→prisma→上述依赖；应用使用PostgreSQL，尚未完成运行产物可达性分析。工具建议Prisma降到6.19.3的大版本变更，未执行自动修复。应单独评估兼容修复。 |

## 生产只读核验

本轮manager/nginx/docker/备份及续期timer为active；HTTPS登录返回200；40G磁盘约16G已用、22G可用。证书到期UTC2026-10-03 19:23:41，即北京时间2026-10-04 03:23:41。9月27至29续期服务日志成功，可能为无需续签的成功退出，不宣称已完成真实续签。未在生产运行测试、写入夹具或发布本轮修复。

## 证据、交接和下一步

临时执行日志：/tmp/manager-full-review.log、/tmp/manager-full-review-rest.log、/tmp/manager-full-review-final.log、/tmp/manager-review-branches.log、/tmp/manager-review-lint.log、/tmp/manager-review-audit.json。前两份包含已说明的环境/旧测试失败；最终对应专项均重跑通过。临时文件不保证永久保留，本报告记录实际结果和边界。

下一步：分公司修复仍需生产构建、按operations.md备份与全表旧数据核对后发布；不需要新迁移。业务权限与时间联动先讨论。后续优先补兼职岗位完整浏览器验收、真实拖动排序，以及独立测试清理错误传播。没有把本轮检查写成全系统无漏洞或全量人工验收。
