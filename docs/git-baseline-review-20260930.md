# Git 基线审查与执行记录（2026-09-30）

## 审查边界

起点HEAD 519c1d8；开始时暂存区为空。以下记录全部modified/deleted/untracked，不删除未知文件。分类A包含业务代码及版本化配置；未改的已跟踪文件继续随新基线保留。审查不代表重新完成全系统人工功能验收。

## 生产关系

重新只读核对生产/opt/manager/app：196个部署源文件SHA-256全部一致。逐文件摘要见[生产源码清单](production-source-manifest-20260930.json)。其中next-env.d.ts是生成文件，比较但不进入Git，其余195个文件可版本化。生产目录额外130个._前缀文件均核验为AppleDouble元数据，不属于业务源码，本轮未删除。

因此可建立“已核验生产应用源码的基线”，不能说Git树完全等于生产文件系统：不包含生产.env、生成客户端、node_modules、编译产物、数据库/上传文件；测试和文档主要是本地开发资料。运行产物没有逐字节重现构建校验，依据当前部署源文件比对及上一轮实际发布记录。

## 提交建议

1. chore: harden repository ignore rules — 仅.gitignore。
2. feat: record current production application baseline — 当前业务源码、19次迁移（旧的已跟踪，新增17次）、测试及部署模板作为一个可构建整体；不按业务模块机械拆开而制造依赖缺失的中间版本。
3. docs: establish production baseline handoff — 当前文档、协作规则、本报告和源码核验清单。

完成暂存候选再次扫描、diff --check与清单核对后，在第3个提交创建本地附注标签production-baseline-20260930。暂不push。标签表示上述范围的生产源码基线，非服务器镜像。

## 不提交与需确认内容

- F构建产物：node_modules、.next、build、app/generated/prisma、next-env.d.ts、tsconfig.tsbuildinfo。
- G临时文件：.DS_Store；忽略普通日志、.data、tmp/temp、backups/screenshots及tar.gz。项目根未发现待提交数据库备份、截图或普通日志；截图在/tmp，不在仓库候选中。正式静态资源如favicon.ico不能按“二进制”盲目删除。
- H敏感文件：本地.env已忽略；*.pem已有规则，新补*.key/*.p12/*.pfx、常用SSH私钥文件名及.ssh；不读取或输出其真实值。
- I不确定来源：.claude/launch.json原配置为npm run dev和3000端口，不含凭证。用户已确认排除该删除，既不提交删除也不恢复它。提交后工作区预计仅剩此D；HEAD仍保留旧本地配置，须与生产源码范围区分。
- scripts/init-production-boss.ts包含固定初始用户名/姓名但无密码，密码取环境变量且已有用户时拒绝初始化；归入E内部部署模板。仓库若公开发布需另外审查个人/基础设施信息，本次不发布远端。

## 忽略规则及敏感检查

原有.env*且!.env.example、node_modules、.next、build、Prisma生成目录、.data规则有效；补密钥格式、dump/sql.gz/sqlite、日志、tar.gz、临时/备份/截图目录及AppleDouble文件。git ls-files -ci无输出，未发现已跟踪却被忽略的危险路径。用git check-ignore验证环境/密钥/备份/生成文件受保护，.env.example未被忽略。

扫描全部可版本化文件（首次251个现存文件，含未修改的已跟踪文件），检查私钥头、常见云/API token、JWT、含凭证连接串及字面量密码/secret/token；关键词覆盖password/secret/token/DATABASE_URL/SESSION_SECRET/Authorization/Cookie/SSH/AccessKey等。无高置信度私钥/云key/token命中。另在内存中与本机.env的4项敏感值/连接密码比较，无候选文件命中；不保存/输出实际值。

需人工复核的命中：.env.example中的本地示例连接与密码占位、docs/history/README-before-handoff.md:155/159/161/163/165的历史测试连接示例、scripts/test-db-protection.ts的u:p虚拟URL、scripts/test-multi-roles.ts:43的测试密码。均为示例/隔离测试内容，未发现真实production credentials。生产初始化脚本无硬编码密码。应用Authorization/Cookie/token引用用于正常认证或隔离HTTP测试，非真实登录会话。

本机无gitleaks/trufflehog，使用定向模式扫描和人工复核；不宣称可以识别所有未知格式秘密。没有扫描或改写Git历史，也未声称历史从未含敏感资料。发现真实凭证须从候选排除并另行轮换，不通过打印确认。

## 完整改动分类清单

| 分类 | 数量 | 处理 |
| --- | ---: | --- |
| A 正式业务源码/配置 | 127 | 审查后纳入 |
| B Prisma migrations | 17 | 审查后纳入 |
| C 测试代码 | 18 | 审查后纳入 |
| D 项目文档 | 26 | 审查后纳入 |
| E 部署脚本 | 11 | 审查后纳入 |
| I 不确定来源（排除） | 1 | 排除删除，保留现状 |

状态M=修改、??=未跟踪、D=删除；列表是本轮生成报告时快照，后续同步文档仍归D。

| 状态 | 分类 | 路径 |
| --- | --- | --- |
| D | I | `.claude/launch.json` |
| M | A | `.gitignore` |
| M | D | `AGENTS.md` |
| M | D | `CLAUDE.md` |
| M | D | `README.md` |
| M | A | `app/boss/branches/page.tsx` |
| M | A | `app/boss/page.tsx` |
| M | A | `app/boss/users/[id]/page.tsx` |
| M | A | `app/boss/users/new/page.tsx` |
| M | A | `app/boss/users/page.tsx` |
| M | A | `app/controller/page.tsx` |
| M | A | `app/layout.tsx` |
| M | A | `app/wip/page.tsx` |
| M | A | `components/create-user-form.tsx` |
| M | A | `components/edit-user-form.tsx` |
| M | A | `components/employment-status-form.tsx` |
| M | A | `components/reset-password-form.tsx` |
| M | A | `lib/auth/permissions.ts` |
| M | A | `lib/auth/role-labels.ts` |
| M | A | `lib/auth/session.ts` |
| M | A | `lib/datetime.ts` |
| M | A | `modules/branches/actions.ts` |
| M | A | `modules/branches/queries.ts` |
| M | A | `modules/users/actions.ts` |
| M | A | `modules/users/boss-guard.ts` |
| M | A | `modules/users/queries.ts` |
| M | A | `modules/users/schema.ts` |
| M | A | `modules/users/user-mutations.ts` |
| M | A | `next.config.ts` |
| M | A | `package.json` |
| M | A | `prisma/schema.prisma` |
| ?? | A | `app/account-config/[id]/page.tsx` |
| ?? | A | `app/account-config/layout.tsx` |
| ?? | A | `app/account-config/page.tsx` |
| ?? | A | `app/accounts/[id]/page.tsx` |
| ?? | A | `app/accounts/history/page.tsx` |
| ?? | A | `app/accounts/layout.tsx` |
| ?? | A | `app/accounts/new/page.tsx` |
| ?? | A | `app/accounts/page.tsx` |
| ?? | A | `app/boss/layout.tsx` |
| ?? | A | `app/leads/[id]/page.tsx` |
| ?? | A | `app/leads/layout.tsx` |
| ?? | A | `app/leads/page.tsx` |
| ?? | A | `app/live-reports/[id]/page.tsx` |
| ?? | A | `app/live-reports/layout.tsx` |
| ?? | A | `app/live-reports/new/page.tsx` |
| ?? | A | `app/live-reports/page.tsx` |
| ?? | A | `app/resources/[kind]/[id]/page.tsx` |
| ?? | A | `app/resources/[kind]/new/page.tsx` |
| ?? | A | `app/resources/[kind]/page.tsx` |
| ?? | A | `app/resources/layout.tsx` |
| ?? | A | `app/workbench/accounts/[id]/page.tsx` |
| ?? | A | `app/workbench/history/page.tsx` |
| ?? | A | `app/workbench/layout.tsx` |
| ?? | A | `app/workbench/page.tsx` |
| ?? | A | `app/workbench/screenshots/[id]/route.ts` |
| ?? | A | `app/workbench/sessions/[id]/page.tsx` |
| ?? | A | `app/workbench/shifts/page.tsx` |
| ?? | A | `components/account-form.tsx` |
| ?? | A | `components/account-history.tsx` |
| ?? | A | `components/anchor-directory.tsx` |
| ?? | A | `components/branch-manager-form.tsx` |
| ?? | A | `components/context-link.tsx` |
| ?? | A | `components/controller-shell.tsx` |
| ?? | A | `components/lead-form.tsx` |
| ?? | A | `components/live-report-details.tsx` |
| ?? | A | `components/live-report-form.tsx` |
| ?? | A | `components/live-report-table.tsx` |
| ?? | A | `components/management-shell.tsx` |
| ?? | A | `components/material-split-form.tsx` |
| ?? | A | `components/monetization-form.tsx` |
| ?? | A | `components/monetization-table.tsx` |
| ?? | A | `components/number-directory.tsx` |
| ?? | A | `components/number-fields.tsx` |
| ?? | A | `components/phone-directory.tsx` |
| ?? | A | `components/report-recycle-form.tsx` |
| ?? | A | `components/resource-form.tsx` |
| ?? | A | `components/user-role-fields.tsx` |
| ?? | A | `components/work-action-form.tsx` |
| ?? | A | `components/work-corrections.tsx` |
| ?? | A | `components/work-evidence-fields.tsx` |
| ?? | C | `components/work-live-clock.test.ts` |
| ?? | A | `components/work-live-clock.tsx` |
| ?? | A | `components/work-scripts.tsx` |
| ?? | A | `components/work-session-data.tsx` |
| ?? | A | `components/work-session-view.tsx` |
| ?? | A | `components/work-shift-panel.tsx` |
| ?? | A | `components/work-stage-tabs.tsx` |
| ?? | A | `components/work-task-correction.tsx` |
| ?? | A | `components/work-task-row.tsx` |
| ?? | A | `components/work-time-input.tsx` |
| ?? | A | `components/workbench-home.tsx` |
| ?? | A | `components/workflow-copy.tsx` |
| ?? | A | `components/workflow-editor.tsx` |
| ?? | A | `components/workspace-switcher.tsx` |
| ?? | E | `deploy/backup.sh` |
| ?? | E | `deploy/build-linux.sh` |
| ?? | E | `deploy/compose.yml` |
| ?? | E | `deploy/manager-backup.service` |
| ?? | E | `deploy/manager-backup.timer` |
| ?? | E | `deploy/manager-cert-renew.service` |
| ?? | E | `deploy/manager-cert-renew.timer` |
| ?? | E | `deploy/manager.service` |
| ?? | E | `deploy/nginx.conf` |
| ?? | E | `deploy/verify-existing-data.mjs` |
| ?? | D | `docs/CHANGELOG.md` |
| ?? | D | `docs/README.md` |
| ?? | D | `docs/acceptance-checklist.md` |
| ?? | D | `docs/architecture.md` |
| ?? | D | `docs/business-rules.md` |
| ?? | D | `docs/controller-workbench-design.md` |
| ?? | D | `docs/current-status.md` |
| ?? | D | `docs/data-dictionary.md` |
| ?? | D | `docs/data-model.md` |
| ?? | D | `docs/decisions.md` |
| ?? | D | `docs/deployment.md` |
| ?? | D | `docs/development-guide.md` |
| ?? | D | `docs/douyin-accounts.md` |
| ?? | D | `docs/git-baseline-review-20260930.md` |
| ?? | D | `docs/history/CLAUDE-before-handoff.md` |
| ?? | D | `docs/history/README-before-handoff.md` |
| ?? | D | `docs/known-issues.md` |
| ?? | D | `docs/lead-specialist.md` |
| ?? | D | `docs/live-reports.md` |
| ?? | D | `docs/operations.md` |
| ?? | D | `docs/production-source-manifest-20260930.json` |
| ?? | D | `docs/resources.md` |
| ?? | D | `docs/system-review-20260929.md` |
| ?? | A | `lib/account-status.ts` |
| ?? | A | `lib/auth/account-permissions.ts` |
| ?? | A | `lib/auth/live-report-permissions.ts` |
| ?? | A | `lib/auth/resource-permissions.ts` |
| ?? | A | `lib/auth/roles.ts` |
| ?? | A | `lib/navigation-trail.ts` |
| ?? | A | `modules/accounts/actions.ts` |
| ?? | A | `modules/accounts/data.ts` |
| ?? | A | `modules/accounts/queries.ts` |
| ?? | A | `modules/accounts/schema.ts` |
| ?? | A | `modules/accounts/service.ts` |
| ?? | A | `modules/branches/service.ts` |
| ?? | A | `modules/leads/actions.ts` |
| ?? | A | `modules/leads/queries.ts` |
| ?? | A | `modules/leads/schema.ts` |
| ?? | A | `modules/leads/service.ts` |
| ?? | A | `modules/live-reports/actions.ts` |
| ?? | A | `modules/live-reports/data.ts` |
| ?? | A | `modules/live-reports/monetization-schema.ts` |
| ?? | A | `modules/live-reports/monetization-service.ts` |
| ?? | A | `modules/live-reports/queries.ts` |
| ?? | A | `modules/live-reports/recycle-service.ts` |
| ?? | A | `modules/live-reports/schema.ts` |
| ?? | A | `modules/live-reports/service.ts` |
| ?? | A | `modules/resources/actions.ts` |
| ?? | A | `modules/resources/data.ts` |
| ?? | A | `modules/resources/queries.ts` |
| ?? | A | `modules/resources/schema.ts` |
| ?? | A | `modules/resources/service.ts` |
| ?? | A | `modules/workbench/actions.ts` |
| ?? | A | `modules/workbench/corrections.ts` |
| ?? | A | `modules/workbench/queries.ts` |
| ?? | A | `modules/workbench/schema.ts` |
| ?? | A | `modules/workbench/screenshots.ts` |
| ?? | A | `modules/workbench/service.ts` |
| ?? | A | `modules/workbench/session-scripts.ts` |
| ?? | A | `modules/workbench/shifts.ts` |
| ?? | B | `prisma/migrations/20260907020357_douyin_accounts/migration.sql` |
| ?? | B | `prisma/migrations/20260908092552_live_reports/migration.sql` |
| ?? | B | `prisma/migrations/20260908095536_live_monetization/migration.sql` |
| ?? | B | `prisma/migrations/20260909093000_controller_workbench/migration.sql` |
| ?? | B | `prisma/migrations/20260910090000_rooms_and_resources/migration.sql` |
| ?? | B | `prisma/migrations/20260910100000_work_session_violation/migration.sql` |
| ?? | B | `prisma/migrations/20260913010000_asset_values/migration.sql` |
| ?? | B | `prisma/migrations/20260913020000_individual_materials/migration.sql` |
| ?? | B | `prisma/migrations/20260915020000_phone_number_details/migration.sql` |
| ?? | B | `prisma/migrations/20260917010000_report_recycle/migration.sql` |
| ?? | B | `prisma/migrations/20260925161313_work_shifts/migration.sql` |
| ?? | B | `prisma/migrations/20260925163000_work_shift_identity/migration.sql` |
| ?? | B | `prisma/migrations/20260925190512_work_evidence/migration.sql` |
| ?? | B | `prisma/migrations/20260927192208_lead_specialist/migration.sql` |
| ?? | B | `prisma/migrations/20260928150022_user_multi_roles/migration.sql` |
| ?? | B | `prisma/migrations/20260928171643_phone_login_accounts/migration.sql` |
| ?? | B | `prisma/migrations/20260929130000_account_ban/migration.sql` |
| ?? | E | `scripts/init-production-boss.ts` |
| ?? | C | `scripts/test-account-ban.ts` |
| ?? | C | `scripts/test-accounts.ts` |
| ?? | C | `scripts/test-ban-migration.ts` |
| ?? | C | `scripts/test-branches.ts` |
| ?? | C | `scripts/test-lead-migration.ts` |
| ?? | C | `scripts/test-leads.ts` |
| ?? | C | `scripts/test-live-reports.ts` |
| ?? | C | `scripts/test-multi-roles.ts` |
| ?? | C | `scripts/test-number-management.ts` |
| ?? | C | `scripts/test-phone-migration.ts` |
| ?? | C | `scripts/test-phone-navigation.ts` |
| ?? | C | `scripts/test-resources.ts` |
| ?? | C | `scripts/test-role-migration.ts` |
| ?? | C | `scripts/test-work-corrections.ts` |
| ?? | C | `scripts/test-work-evidence.ts` |
| ?? | C | `scripts/test-work-shifts.ts` |
| ?? | C | `scripts/test-workbench.ts` |

## 实际执行与验证

- 忽略规则提交：4a06f5c，1文件。
- 应用整体提交：ab4b610，172文件；使用明确pathspec清单，暂存路径与审批分类逐项一致，暂存敏感路径与高置信度模式复查通过。
- 文档交接：独立提交本报告等26份文件；完整基线通过附注标签production-baseline-20260930定位，不在本文件写自引用提交哈希。
- 本轮重跑typecheck、全app/components/lib/modules/scripts eslint（排除生成代码）通过。git diff --check与本地文档链接验证通过；没有为纯Git整理重新在生产跑业务测试或部署。
- 本轮源码比对196文件零差异；标签中195个可版本化文件需按清单逐一核验，next-env.d.ts按生成物排除。生产130个AppleDouble元数据未动。
- 用户明确排除.claude/launch.json删除；最终仅此D，未恢复/删除未知文件。没有push远端，没有创建远端仓库，没有改写旧提交。
- 扫描有工具/模式局限；新增环境变量、截图、数据库备份以后仍必须检查，不能把此次未发现秘密当作未来免检依据。
