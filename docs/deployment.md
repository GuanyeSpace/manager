> 文档定位（2026-09-29整理）：本文件是历史发布证据，段落并非完全按日期排序。当前操作步骤统一见 [operations.md](operations.md)，最近上线快照见 [current-status.md](current-status.md)。早期禁止服务器构建、旧证书到期时间等须结合后续受限构建和最新核验，不能当作永恒现状。

# 生产部署

## 2026-10-01 D049 下播方式细分

- 正常、违规断播、违规封禁、设备问题断播、其他异常中断；非正常原因与截图必填，历史INTERRUPTED保留。无schema变更，22迁移无待执行。
- 类型、lint、本地及服务器构建通过；证据专项覆盖四类原因/截图缺失拒绝、保存类型、收尾复用、不自动封禁；更正/工作台/导粉回归及截图HTTP权限/原字节通过。浏览器已看到五选项，恢复连接连续超时，未完成后续交互复测；不将前次验收当作本轮完成。
- stage /opt/manager/build-endtypes-20261001，unit manager-endtypes-build成功。暂停写入后备份/var/backups/manager/manager-20261001T122255Z.dump及同名截图包，二者可读。
- 摘要/opt/manager/data-before-endtypes-20261001.json，20张旧表所有原列一致。旧程序/opt/manager/standalone-before-endtypes-20261001，源码归档/opt/manager/source-before-endtypes-20261001.tar.gz。
- 210文件SHA-256一致，manager/nginx active，HTTPS登录200、匿名工作台307，截图存储探针通过。未创建正式测试场次。临时夹具已清理、3103停止，Git按明确清单同步main。

## 2026-10-01 D048 三阶段与截图修复

- 隔离类型/lint/构建、相关业务及HTTP回归、桌面真实图片验收通过，详见[专项验收](tasks/work-stages-verification.md)。
- staging：/opt/manager/build-workstages-20261001；最终unit manager-workstages-final-build，webpack退出0、峰值795.8M。前一构建因追加历史兼容保护主动停止；正式程序未受影响。
- 暂停写入后备份：/var/backups/manager/manager-20261001T085232Z.dump及同名.screenshots.tar.gz；pg_restore --list和tar列表均可读。
- 数据摘要：/opt/manager/data-before-workstages-20261001.json；新增迁移20261001160000_work_stages仅增加可空hasOtherIncident。22迁移全部到位，20张业务表所有原列数据一致，没有回填或删除历史。
- 旧程序：/opt/manager/standalone-before-workstages-20261001；源码归档/opt/manager/source-before-workstages-20261001.tar.gz。新增可空列兼容旧程序回退，禁止用数据库恢复覆盖合法新写入。
- 截图父目录root:root 750改为root:manager-app 750，子目录保持manager-app:manager-app 700；未递归调整旧文件。激活前后应用用户临时探针写入、读回、删除成功，未创建正式测试场次。
- 激活后210个部署文件SHA-256一致；manager/nginx/backup.timer/cert-renew.timer active；HTTPS /login=200，匿名/workbench=307。定时器active不代表本轮执行了续期。
- 本地测试夹具清理首次遇到AccountWorkflow外键限制，按该夹具范围补清理后成功。3103服务和验收页面关闭，截图证据留在/tmp，不提交。
- Git与部署分别核对：本任务代码、迁移、测试和文档按明确路径提交并推送origin/main；敏感文件、截图、临时产物排除。

## 2026-09-15 未完成事项核对与拖动排序发布

- 已核对此前上线的物资独立编号、主播关联账号的运营/中控修改入口、流程秒级时间配置。本次发布将流程排序改为指针拖动，同阶段移动完整事项；保留上移/下移按钮，修改后须保存。
- `manager-drag-build` 受限构建成功，正式源码与本地 workflow-editor SHA-256 一致：`79c593a6172730fcb1949d03aa3d4a28ab2e10b83a60f7a804c85d1136eab505`。无新增迁移。
- 停止应用写入后备份 `/var/backups/manager/manager-20260915T090111Z.dump`，旧数据快照 `/opt/manager/data-before-drag-20260915.json`，16 张业务表的旧数据核对通过。旧应用 `/opt/manager/standalone-before-drag-20260915`、旧源码 `source-before-drag-20260915.tar.gz` 保留。
- lint、typecheck、隔离库工作台回归通过；额外运行组件事件检查，验证整项排序、跨阶段/表单外/取消拖动保护、秒数与说明保留、按钮排序及提交内容。浏览器工具无法返回当前页面内容与截图，真实指针拖动的页面验收仍待补充，不等同于已通过浏览器验收。未保存任何生产测试配置。
- HTTPS 检查发现证书因服务器连接 ACME 超时而过期。通过临时 SSH 回环转发完成续期，TLS 校验保持开启，转发已关闭；新证书到期时间为北京时间 2026-09-22 08:02:34。HTTPS /login 返回 200，应用、nginx、备份与续期定时器运行正常。
- 待运维处理：服务器直连 ACME 的网络超时尚未解决，定时器启用不代表后续续期一定成功。本次临时转发未写入定时器配置，后续需恢复稳定的续期网络路径。

服务器：8.163.69.11（阿里云，Ubuntu 26.04，amd64）。2026-09-08 首次部署，用户选择空业务库，无域名，使用 IP HTTPS。

## 运行结构

- Node.js 22，Next.js standalone 生产构建，systemd `manager.service`，运行账号 `manager-app`，只监听 127.0.0.1:3000。
- Nginx 对外提供 80/443；HTTP 跳转 HTTPS，ACME 验证路径除外。覆盖客户端转发头，应用设置 TRUST_PROXY=true。
- PostgreSQL 16 官方容器，Compose 项目名 manager，配置 `/opt/manager/compose.yml`；只映射 127.0.0.1:5433，持久卷 manager_manager_data。
- 程序 `/opt/manager/app`；应用环境 `/etc/manager/app.env`（root:manager-app，640）；数据库环境 `/etc/manager/database.env`（root，600）。不使用本地开发密钥，不上传 .env、node_modules 或 macOS 构建产物。
- 增加 2 GiB swap 以支持小内存服务器构建。应用启动与失败恢复由 systemd 管理，数据库由 Docker restart 策略管理。

## HTTPS 与备份

- IP 证书使用 Let's Encrypt shortlived（约 6 天），Certbot 安装在 `/opt/certbot`。
- `manager-cert-renew.timer` 每天检查两次，续期成功后重载 Nginx；80 端口 ACME 路径必须持续可访问。
- `manager-backup.timer` 每天北京时间 03:00 执行 pg_dump，自定义格式存放 `/var/backups/manager`，保留 14 天。
- 当前是同机备份，不能抵御整台服务器或磁盘丢失；需要后续接入独立备份存储。

## 初始化与更新

- `scripts/init-production-boss.ts` 只允许在无用户的数据库中执行，创建 WangGuanye 老板账号并要求首次改密，不创建测试账号或业务数据。初始密码通过环境变量提供，不记录到日志或源码。
- 更新前运行备份，传输源码时排除 .env、node_modules、app/generated、.next、.git。
- 小内存服务器不直接构建。使用本地 Linux amd64 Node.js 22 容器执行 npm ci、Prisma generate、npm run build -- --webpack。打包 .next/standalone，并将 .next/static、public 分别放入 standalone/.next/static、standalone/public，传到服务器相同目录。服务器先执行 Prisma migrate deploy，部署构建产物后重启 manager。不要在生产环境运行 migrate dev、db push 或测试脚本。
- 配置模板保存在 deploy/。数据库结构更新不可仅靠恢复旧程序回滚，需检查迁移兼容性并使用已验证备份。
- SSH 专用密钥在本机 ~/.ssh/manager_server_ed25519；已通过控制台截图核对服务器 ED25519 指纹，固定在 ~/.ssh/manager_server_known_hosts。

## 运维检查

- `systemctl status manager nginx docker` 查看服务。
- `journalctl -u manager --since today` 查看应用日志。
- `systemctl list-timers 'manager-*'` 查看备份与证书续期。
- `/opt/certbot/bin/certbot certificates` 查看证书有效期。
- `/opt/manager/backup.sh` 手工备份。
- 恢复演练使用新建的独立测试数据库，核对数据后只删除本轮演练库，禁止覆盖正式库。

## 上线验收（2026-09-09）

- Linux amd64 standalone 构建通过，正式包 SHA-256：2514466602066a70ede27ce0a986325020784fb0b42c25edc3b7f3654d8e6620。本机留存 build/manager-linux-release.tar.gz（不入版本库）。
- 公网 HTTPS /login 返回 200；浏览器登录页正常显示；真实老板初始凭据登录成功，会话 Cookie 为 Secure、HttpOnly，首次改密守卫生效。未代用户修改密码。
- HTTP 跳转 HTTPS，应用与数据库仅监听回环地址；manager、Nginx、Docker 及两个定时器已启动。
- Certbot renew --dry-run 成功；备份恢复到本轮独立测试库验证成功，核对 1 位老板、0 分公司、0 场直播，随后删除了本轮恢复测试库。
- 初始登录信息以权限 600 的独立文件交付到用户 Documents 目录，不进入源码或日志。首次登录由用户设置自己的密码。
- 首次尝试在服务器构建时实例变得无响应，普通重启恢复；之后采用本机 Linux 容器构建，服务器仅运行产物。构建环境需安装 OpenSSL 和 ca-certificates，并使用锁定版本的本地 Prisma 命令。

## 中控工作台更新（2026-09-09）

- 增量迁移 `20260909093000_controller_workbench` 新增账号流程、场次、执行记录和日常检查；LiveReport 增加可空场次关联。保留所有已录入的正式员工、账号及直播数据，不重新初始化。
- 在独立目录 `/opt/manager/build-workbench-20260909` 使用已有锁定依赖构建，生产服务继续运行。经验证的服务器构建例外：必须采用 webpack、单 worker，以及 systemd 的 MemoryMax=1100M、MemorySwapMax=300M、CPUQuota=100%、NODE_OPTIONS=--max-old-space-size=768 资源限制；禁止取消限制直接构建。此方式补充前述本地 Linux 容器构建方案。
- 首轮构建成功，耗时 112 秒、内存峰值 828 MiB；最终版本另行增量构建。切换前运行备份和 migrate deploy，保留旧 standalone 与源码包，健康检查失败时恢复旧程序；迁移为向后兼容的增量变更。
- 验证：lint、typecheck、账号回归、直播/变现回归、工作台权限与并发/历史测试；独立测试库对工作台、账号配置、执行记录、报表预填和历史页面进行真实 HTTP 渲染验证，越权页面返回 404。测试数据按本轮前缀清理，未写入生产业务表。

- 正式迁移及首次切换成功，浏览器使用现有老板会话验证工作台、真实账号与流程编辑页正常；旧数据保留。账号未绑定主播显示“未绑定主播”，不根据是否绑定主播推断账号用途。

## 主播、直播间与物资更新（2026-09-09）

- 新增管理入口 /resources/anchors、rooms、numbers、phones、equipment；中控页面重新分栏并采用阶段切换。
- 增量迁移 `20260910090000_rooms_and_resources` 已应用到正式库，旧的有效且唯一手机号建立独立档案关联，重复/无效文字原样保留。测试验证号码回填和开户人不推断。
- 独立目录 /opt/manager/build-resources-20260909 在单 worker、CPU/内存限额下完成构建，耗时约 122 秒，峰值 832.5 MiB。
- 切换时停止应用写入后备份并迁移，保留 /opt/manager/standalone-before-resources-20260909 与源码包。正式服务、HTTPS、备份和证书定时器正常。
- 验收通过：lint、typecheck、账号/直播/工作台回归、资源关联与权限及并发测试、三阶段切换保留输入的组件验证、真实 HTTP 页面渲染与越权 404。浏览器验证线上直播间列表、手机双卡槽及归属表单、新增主播默认岗位。
- 未创建示例主播、直播间、号码或设备到生产；正式资料由用户按实际情况填写。

### 2026-09-10 老板导航与中控流程分工上线

- 正式版本已备份并切换：管理侧边栏、顶部导航、账号独立流程配置、中控话术权限、带完成时间和备注的执行清单、场次违规记录。
- 追加迁移 `20260910100000_work_session_violation`，历史场次违规字段保持未记录，未清空业务数据。
- 受限构建 `manager-workflow-build-final` 成功；旧版本保留在 `/opt/manager/standalone-before-workflow-20260910`，源文件备份 `source-before-workflow-20260910.tar.gz`；切换前执行数据库备份。
- 隔离库验证流程与话术权限、时间保留、取消勾选、违规必填、快照与并发开播；HTTP 验证管理导航与配置权限；浏览器检查新版布局；lint/typecheck 和正式构建通过。

### 2026-09-10 中控执行空间与同页数据填报

- 上线中控侧边栏/顶部导航、直接责任物资只读权限、账号当前场次直达、检查清单预览，以及本场直播/变现表单嵌入。
- 直播和变现表单支持留在场次页保存；独立查询详情对中控只读。保留当时由本人负责的历史记录。
- 无新增数据库迁移，切换前仍执行备份。旧版本 `/opt/manager/standalone-before-controller-20260910`；构建 `manager-controller-build` 成功，内存峰值 793.1 MiB。
- 通过账号、资源、直播报表、工作台回归，以及同页表单 HTTP 检查、变现表单失败保留输入检查、lint/typecheck、正式构建。HTTPS 登录与应用服务正常。

### 2026-09-12 恢复中控数据录入和维护入口

- 已切换此前成功构建的 `manager-report-entry-build`，恢复首页/侧边栏填写入口、数据列表新增和本人记录详情的补填/更正；服务端归属限制不变。
- 核对三个核心文件与构建目录哈希一致；切换前备份数据库和旧应用，无新增迁移；应用、HTTPS、备份与证书定时服务正常。
- 改动前轮 lint/typecheck、直播报表及工作台业务测试已通过；本次继续时本机 Colima 未运行，额外复跑在数据库连接校验处退出，未操作测试数据。正式环境服务检查正常。

### 2026-09-12 统一账号流程与批量复制配置

- 中控账号入口统一三阶段布局，开始准备后仍在账号页面执行和填报；账号配置新增按阶段、话术、素材复制到一个或多个目标账号。
- 隔离库工作台业务及 HTTP 测试、lint、typecheck、页面排版检查通过；验证批量权限、版本冲突、全批回滚与场次快照不变。测试资料已清理，未写入正式业务数据。
- `manager-flow-copy-build` 在既定 CPU/内存限制下构建成功，耗时约 116 秒，峰值 824.2 MiB。切换前数据库备份，无新增迁移；旧应用保留于 `/opt/manager/standalone-before-flow-copy-20260912`，源码备份 `source-before-flow-copy-20260912.tar.gz`。
- 正式服务、nginx、备份和证书定时器正常，HTTPS 登录返回 200，浏览器确认线上复制配置入口及真实账号列表正常。

### 2026-09-13 物资与资产价值（小步增量上线）

- 新增家具、小物件物资入口；手机、设备、物资登记数量、单位、购入日期、购入单价及当前单件估值。沿用归属、权限、版本及审计逻辑。
- 增量迁移 `20260913010000_asset_values` 仅增加类别和字段，无旧字段更新、删除或数据重置。切换前暂停写入并运行数据库备份。
- 在正式数据库迁移前后用 `deploy/verify-existing-data.mjs` 核对 16 张表的所有旧列，行数与内容摘要全部一致；摘要保留在 `/opt/manager/data-before-assets-20260913.json`，权限 600。
- 独立受限构建 `manager-assets-build` 成功，耗时约 118 秒、内存峰值 797 MiB。旧应用 `/opt/manager/standalone-before-assets-20260913` 和源码备份 `source-before-assets-20260913.tar.gz` 保留。
- 隔离库资源业务与真实 HTTP、账号回归、lint/typecheck、迁移前后原数据比较、核对工具不一致拒绝路径通过；测试数据清理完成。浏览器确认线上物资、手机、设备列表新字段；HTTPS 200，应用、nginx、备份与证书定时器正常。

### 2026-09-13 一物一码与旧批次手动拆分

- 上线物资逐件/按量登记、单件编号固定、旧批次手动拆分和来源归档；只读来源不重复计入现有物资。未自动拆分任何正式资料。
- 增量迁移 `20260913020000_individual_materials` 增加拆分标记及来源外键。切换前备份，16 张表所有旧列的行数、摘要核对一致；摘要 `/opt/manager/data-before-individual-20260913.json`。
- `manager-individual-build` 受限构建成功，约 124 秒、峰值 790.2 MiB；旧应用 `/opt/manager/standalone-before-individual-20260913`，源码备份 `source-before-individual-20260913.tar.gz` 保留。
- 通过资源隔离库测试与 HTTP、账号回归、lint/typecheck；验证数量/金额守恒、冲突及整批回滚、并发重复提交、分配后隔离、归档只读。浏览器确认正式新增页逐件选项；HTTPS 200，应用与定时服务正常。

## 2026-09-15 手机号套餐、关联与筛选上线

- 上线手机号每页 10 条列表、开户人/使用人/状态筛选、四平台绑定展示、主副卡共享套餐、已编号手机双卡槽与其他手机说明；保持中控只读及原有数据范围。
- 增量迁移 `20260915020000_phone_number_details` 已应用。停止应用写入后备份，`/opt/manager/data-before-numbers-20260915.json` 核对 16 张表全部旧字段数据一致。
- 受限构建 `manager-numbers-build` 成功，耗时约 122 秒，内存峰值 833.3 MiB。旧应用 `/opt/manager/standalone-before-numbers-20260915`，旧源码 `source-before-numbers-20260915.tar.gz` 保留。
- lint/typecheck、手机号专项测试、原有资源和账号回归、隔离库真实 HTTP 列表及表单渲染通过，测试数据已清理。正式 HTTPS 登录 200，应用、nginx、备份和证书定时器正常。
- 发布后核对列表与资源服务源码 SHA-256 与本地一致。未往正式库添加测试手机号，也未用测试操作保存正式资料；新金额与流量默认未登记，原套餐文字和运营商值保留。

## 2026-09-17 直播及变现数据删除与恢复上线

- 列表操作列、详情页和场次同页新增独立删除/恢复入口，新增回收站。原始指标与工作流程记录保留，沿用已有维护权限，二次确认、并发版本保护和审计同事务提交。
- `manager-recycle-build` 受限构建成功，约 121 秒、内存峰值 800.1 MiB；追加迁移 `20260917010000_report_recycle`，仅新增两个可空标记字段。
- 停止应用写入后备份，快照 `/opt/manager/data-before-recycle-20260917.json` 核对 16 张业务表旧数据一致。旧应用 `/opt/manager/standalone-before-recycle-20260917`、源码 `source-before-recycle-20260917.tar.gz` 保留。
- lint、typecheck、直播报表和工作台回归、隔离库 HTTP 回收站与删除后详情渲染检查通过；测试数据已清理，未删除任何生产记录。正式 HTTPS 登录返回 200。
- 回滚提醒：若上线后已有记录被软删除，旧版程序不识别删除标记，可能重新展示这些记录；需优先修复当前版本或验证兼容回滚方案，不能将旧版直接切回视为等价状态。

## 2026-09-19 打粉数据名称统一

- 按用户要求，将所有运行时页面及提示中的“变现”改为“打粉”，覆盖导航、表格、填写/保存、待办、删除/恢复及错误信息。内部字段、网址、统计口径和历史数据不变，未新增迁移。
- lint/typecheck 与受限生产构建通过（`manager-dafen-build`，约 117 秒，峰值 843.2 MiB）；运行时代码检索无“变现”残留。
- 发布前备份，`data-before-dafen-20260919.json` 核对 16 张表旧数据全部一致。旧应用 `standalone-before-dafen-20260919` 和源码备份保留；应用运行正常，HTTPS 登录返回 200。

## 2026-09-23 中控剥离数据职责

- 中控移除直播数据及打粉数据的查看、录入、更正、删除、恢复权限；同步隐藏导航、同页表单和补数据待办。保留开播准备、直播流程、下播检查、违规记录、收尾及工作历史。旧数据全部保留，暂由老板维护；打粉专员仅登记后续规划。
- 隔离库直播数据与工作台业务、HTTP 回归通过，包含中控旧链接拒绝、历史本人记录不可读写、老板维护、完成场次不因缺数据重现待办；测试数据清理完成。lint/typecheck 通过。
- 受限构建 `manager-execution-build` 成功，约 122 秒、峰值 815.8 MiB。本次无新增迁移，部署确认 12 个迁移无待执行项。
- 停止应用写入后备份 `manager-20260922T175235Z.dump`，快照 `/opt/manager/data-before-execution-20260923.json` 对 16 张业务表所有旧数据核对一致。旧应用 `/opt/manager/standalone-before-execution-20260923` 与源码 `source-before-execution-20260923.tar.gz` 保留。
- 正式 HTTPS 登录 200；应用、nginx、备份与证书定时器正常。权限、查询、写入和中控页面等 11 个关键文件与本地 SHA-256 一致，未在正式库添加测试记录。

## 2026-09-25 中控执行流程打磨

- 上线任务异常/不适用/恢复待处理入口、阶段状态数量、收尾缺项提示、未收尾场次续办入口、实际时间快捷填写及核对提示。直播事项未处理完时，下播要求说明原因并在收尾和历史显示漏项。
- 工作台隔离库业务及 HTTP 回归、lint/typecheck 通过；覆盖原因必填、状态及操作时间、漏项下播校验、待收尾入口、完成后移除待办、中控数据隔离；测试记录已清理。
- `manager-polish-build` 受限构建成功，约 123 秒，峰值 829.5 MiB。无新增迁移，12 个迁移无待执行项。
- 暂停写入后备份 `manager-20260925T071851Z.dump`，快照 `/opt/manager/data-before-polish-20260925.json` 核对 16 张业务表原有数据一致。旧应用 `standalone-before-polish-20260925` 与旧源码备份保留。
- HTTPS 登录 200，应用、nginx、备份及证书定时器正常；5 个本轮运行时文件 SHA-256 与本地一致。未改写正式账号流程或已有工作记录。

## 2026-09-26 中控上班与场次基础（第一步）

- 新增跨日 WorkShift、每日设备检查及变更历史、首场提前到岗时长、结束上班收尾门槛；新场次关联登录账号和实际中控，场次自动命名，本分公司在职人员选择，开播后锁定。
- 新场次开播必须声音/画面/网络检查正常；登录人和实际执行人的并发及时间冲突双重校验。旧场次保持原值及旧流程，不伪造上班记录。
- 隔离库工作台与上班专项、HTTP 页面与越权、lint/typecheck 通过；覆盖两账号原负责人相同但实际人员不冲突可同时播、跨日不重置、设备修复审计、事务回滚、旧记录可继续处理。测试数据清理完成。
- 受限构建 `manager-shifts-build` 成功，约 122 秒、峰值 841.1 MiB。新增迁移 `20260925161313_work_shifts` 与 `20260925163000_work_shift_identity`，增加表与可空列、新身份唯一索引并移除旧按账号主责限制的索引。
- 暂停写入后备份 `manager-20260925T162542Z.dump`，快照 `/opt/manager/data-before-shifts-20260926.json` 核对 16 张原有业务表旧字段数据全部一致。旧应用 `standalone-before-shifts-20260926` 和源码备份保留。
- HTTPS 登录 200；应用、nginx、备份及证书定时器正常；7 个关键源码/结构文件哈希与本地一致，未向生产写入测试记录。
- 回滚时需保留新增表和身份字段，不执行逆向删列；已产生新身份场次后，旧程序不识别实际中控与每日门槛，不能直接将回切旧程序视为业务等价。优先修复当前版。
- 后续两步仍待实施：异常截图、提醒与话术同步，以及补填/已收尾更正等，不在本次上线完成范围内。


## 2026-09-26 中控执行与异常（第二步）

- 上线未正常开播、异常中断、直播中违规和多图截图；下播收尾有异常/无异常确认；按账号时间提醒与随主播口令事项；本场及账号话术同步、一键复制。移除固定 15 分钟巡检及素材入口，原记录和素材内容保留。
- `manager-evidence-final-build` 最终受限构建成功，约 85 秒，内存峰值 819.5 MiB。lint/typecheck、工作台及上班回归、截图/话术专项与真实 HTTP 图片授权测试、秒级/手动事项提醒测试通过；隔离测试记录已清理。浏览器检查了服务端渲染页面的布局与截图入口。
- 上线应用迁移 `20260925190512_work_evidence`，仅增加 WorkSession 三个可空字段与 WorkScreenshot 表；15 个迁移均已应用。暂停写入后，`/opt/manager/data-before-evidence-20260926.json` 核对原有 17 张表全部旧字段数据一致。
- 发布备份：`/var/backups/manager/manager-20260926T053234Z.dump` 与同名 `.screenshots.tar.gz`，已验证归档可读取。本次上线前还没有截图，首份截图归档为空目录属正常情况。
- 图片私有路径 `/opt/manager/uploads/work-screenshots`，目录 700、owner manager-app，由 systemd 的 `screenshots.conf` 指定 WORK_SCREENSHOT_DIR；图片不放 public，不由 nginx 静态暴露。nginx 上传上限 22MB，应用每次最多 6 张、单张 5MB、总计 20MB。图片读取校验登录和场次历史范围，禁止缓存及内容类型猜测。
- `/opt/manager/backup.sh` 每日备份数据库和截图目录，均保留 14 天。恢复时需同一时间戳的两份归档一起核对，截图恢复到上述路径并保留 manager-app 的读取权限，不用旧目录覆盖新上传文件。
- 旧应用 `/opt/manager/standalone-before-evidence-20260926`、源码、nginx 与备份脚本副本保留。回滚不删除新增字段/表/图片；旧版不支持异常结果与截图规则，产生新记录后应优先修复当前版，不能将回切视为业务等价。
- HTTPS 登录 200，manager/nginx/备份与 manager-cert-renew 定时器正常；13 个关键源码文件与本地哈希一致。未在正式数据库创建测试记录。
- 第三步仍待实施：补填到岗/实际时间、已收尾记录更正及原因与原值查询。本次不将这些能力声明为已上线。


## 2026-09-26 中控更正与查询（第三步）

- 上线补填实际到岗/开播时间、上班时间及每日检查更正、已收尾场次和未正常开播记录更正；涵盖实际中控、事项、违规、收尾原因和补充截图。更正必填原因，保留原值、操作人、操作时间和版本，老板可直接查看，无审批。
- 事项仅改备注保留原完成时间；更改状态由服务器记录当前时间，旧时间保存在历史中。原图片不删除。人员与时间更正检查重叠及上班边界，不改变统计数据、归档状态、登录身份或账号归属。
- lint/typecheck、工作台/上班/截图及更正专项、真实 HTTP 权限与上传回归通过。测试覆盖越权、并发人员冲突、过期版本、事务回滚、失败图片清理、原秒/毫秒保留。浏览器实际验证错误输入保留、正确更正保存、历史前后值展示；隔离测试数据已清理，未向正式库写入测试记录。
- `manager-corrections-build` 受限构建成功，约 123 秒、内存峰值 867.1 MiB。本次无新增迁移，15 个迁移全部已应用。
- 暂停写入后备份 `/var/backups/manager/manager-20260926T123120Z.dump` 及同名 `.screenshots.tar.gz`，均验证可读取。上线前后快照 `/opt/manager/data-before-corrections-20260926.json` 核对 18 张业务表所有原数据一致。
- 旧应用 `/opt/manager/standalone-before-corrections-20260926`、旧源码 `/opt/manager/source-before-corrections-20260926.tar.gz` 保留。正式 HTTPS 登录 200，应用、nginx、备份及证书定时器正常；14 个本轮关键文件 SHA-256 与本地一致。
- 已完成本次确认方案的三步上线；历史章节中的“待实施”仅指各自发布时状态。更正记录使用现有表存储，不回填或批量改写历史资料。

## 2026-09-27 岗位名称统一为直播中控

- 将岗位中文名、工作台标题、人员选择及账号/物资关联字段、操作提示统一为“直播中控”。内部 CONTROLLER 枚举、身份权限、绑定关系、历史记录及数据库结构不变；历史已存文字不批量改写。
- 逐文件对照线上原版，25 个运行时文件均仅中文名称替换。lint/typecheck、残留名称检查、受限构建通过；`manager-role-name-build` 约 124 秒，内存峰值 875.2 MiB。无需新迁移。
- 暂停写入后备份 `manager-20260927T141029Z.dump` 和同名截图归档，已验证可读取；上线后 `data-before-role-name-20260927.json` 核对 18 张业务表原数据一致。
- 保留旧应用 `/opt/manager/standalone-before-role-name-20260927` 和源码备份。25 个运行时文件与本地哈希一致；HTTPS 登录 200，应用、nginx、备份和证书定时器正常。
- 导粉专员仅进入需求讨论，本次未新增岗位或权限。

## 2026-09-28 导粉专员认领与数据填报

- 上线导粉专员岗位及 `/leads` 工作台：本公司已实际开播场次认领、一人多场/一场一人、草稿与跨天补填、提交完成、更正历史、误认领纠正、回收站。未正常开播、准备中及旧场次不进入认领池。
- 运营只读负责账号数据；导粉专员只处理本人认领场次；老板及原分公司负责人维护权限范围内的数据。员工离职由负责人补齐，账号调拨不转移历史数据归属。直播中控继续隔离统计数据。
- 新填报不含带货；既有带货历史值保留，历史打粉保存不会覆盖旧 GMV。旧报表增加负责人维护能力和可见修改历史，新流程的报表修改统一回到导粉页面，防止绕过草稿/完成/审计状态。
- 增量迁移 `20260927192208_lead_specialist` 仅追加 Role 值、LeadTask 表与 WorkSession.leadEligible。旧场次该值 false，新场次默认 true。16 个迁移全部应用；未创建正式导粉员工、认领正式场次或写入测试数据。
- 专项测试通过：认领及编辑竞态、两场正在直播同时认领、角色/分公司隔离、零与留空、完成条件、跨天补填、误认领即时撤权、离职补填、调拨、旧接口保护、软删除、审计及事务回滚。真实 HTTP 验证页面、越权和新岗位首页跳转；原工作台、上班、更正和直播数据回归通过。测试均为隔离数据库，测试数据已清理。
- 独立临时库迁移演练验证 18 张旧表全部旧列不变，并确认旧场次不自动开启认领、新场次默认开启。lint/typecheck 通过。浏览器工具连续连接超时，尚未完成浏览器目视布局和点击验收，不将 HTTP 检查等同于视觉验收。
- `manager-leads-build` 受限构建成功，约 127 秒、内存峰值 878.3 MiB。上线前暂停写入，备份 `/var/backups/manager/manager-20260927T194306Z.dump` 与同名 `.screenshots.tar.gz`，均验证可读取。
- `/opt/manager/data-before-leads-20260928.json` 在迁移后和应用切换后均验证 18 张原有业务表旧数据一致。旧应用 `/opt/manager/standalone-before-leads-20260928` 与源码备份保留；165 个源文件/结构文件与本地哈希一致；HTTPS 登录 200，未登录访问导粉页 307，应用、nginx、备份及证书定时器正常。
- 回退不删除新枚举、表、字段或数据。创建导粉员工、认领和填报后，旧版不能识别新岗位及填报状态，优先修复当前版本，不将回切旧程序视为业务等价。

## 2026-09-28 员工多岗位与兼职导粉

- 员工新增/编辑改为岗位多选，列表展示全部岗位，按岗位筛选及账号/主播/物资人员候选支持兼任。顶部按已授予岗位显示工作台入口，直播中控可同时认领其他直播间的导粉场次；原单人同时一场中控直播约束不变。
- 数据权限取已授权职责合集：兼职导粉可维护自己认领场次，运营职责只增加负责账号的只读范围，老板权限不被其他岗位遮盖。增加岗位保留绑定，撤销相关岗位检查交接，撤销导粉即失去导粉访问权限但保留认领及数据历史；人员岗位变更有审计与并发保护。
- 新增迁移 `20260928150022_user_multi_roles` 仅增加 User.roles，原岗位保留、旧员工不自动兼任。17 个迁移全部已应用。上线前停止写入并备份 `/var/backups/manager/manager-20260928T151539Z.dump` 和同名截图归档，两份均验证可读。
- `/opt/manager/data-before-multi-roles-20260928.json` 在迁移后和服务恢复后均验证 19 张业务表全部原字段数据一致。未在正式库创建测试员工或修改员工岗位。
- 独立临时库迁移演练、多岗位专项、老板并发保护、账号、物资、导粉、直播报表和中控工作台回归全部通过。真实 HTTP 验证同一兼职员工访问两个工作台及入口、人员岗位多选表单、导粉权限隔离；lint/typecheck 通过。未完成浏览器目视及点击验收，不以 HTTP 验证替代视觉验收。
- `manager-multi-roles-build` 受限构建成功，约 125 秒、内存峰值 862 MiB。正式 HTTPS 登录 200，未登录导粉访问 307，manager/nginx/备份/证书定时器均正常，171 个源文件与本地 SHA-256 一致。
- 旧程序 `/opt/manager/standalone-before-multi-roles-20260928` 和源码归档保留。回退不删除新增字段和岗位数据；员工配置兼任后，旧版本只识别单岗位，不将回切视为业务等价，优先修复当前版本。

## 2026-09-29 管理导航与手机实际登录账号

- 关联详情逐级返回并保留筛选、页码和每页条数；保存保留来源。覆盖物资、账号、员工、流程配置和报表相关详情入口，侧边栏继续直接进入模块。手机号与手机列表默认 20 条，可选 10/20/50。
- 手机列表按要求显示七列；实际登录抖音账号多选、微信号多行登记，与 SIM 绑定独立保存，卡槽号码与登录抖音账号可关联查看。原资产成本和估值仍保留在详情。
- 增量迁移 `20260928171643_phone_login_accounts` 仅新增 AssetDevice.loginWechats 和 PhoneAccountLogin，旧手机不推断实际登录账号。18 个迁移全部已应用。
- 隔离迁移演练验证 19 张原有表全部旧列不变；专项测试覆盖分页边界、关联保存、权限、调拨、版本冲突和审计。账号、物资、直播数据、导粉、中控、多岗位回归通过；typecheck/lint 通过。浏览器使用临时测试数据验证逐级返回、编辑保存保留来源、原筛选第 2 页恢复及每页 50 条，手机七列桌面布局目视通过。测试资料已清理。
- `manager-navigation-build` 受限构建成功，约 127 秒，内存峰值 878.2 MiB。暂停写入后备份 `/var/backups/manager/manager-20260929T050206Z.dump` 和同名截图归档，均已验证可读。
- `/opt/manager/data-before-navigation-20260929.json` 在迁移后及服务恢复后均验证 19 张业务表全部原字段数据一致。未创建正式测试数据；174 个源文件与本地 SHA-256 一致。
- HTTPS 登录 200，未登录访问手机/手机号页 307；manager、nginx、备份与证书定时器均正常。保留旧应用 `/opt/manager/standalone-before-navigation-20260929` 和源码归档。回退不删除新增表、字段或登录关联数据。

## 2026-09-29 新导粉待补误报修复（K005）

- 仅3个运行文件：modules/workbench/service.ts、schema.ts和components/workbench-home.tsx。按leadEligible区分新旧场次；新导粉不检查带货，旧场次继续检查带货确认/已带货缺GMV；缺打粉、删除、待收尾提示保留。不改权限或已有数据。
- 新增隔离回归先观察到“完整零值仍待补”的预期失败，修复后工作台、导粉、多岗位回归及typecheck/相关eslint通过。测试数据清理成功；本轮无业务HTTP及浏览器验收，仅生产健康检查。
- 首次构建发生socket hang up并重试，停止该独立构建后复用上一版缓存重新受限构建成功；约122秒、峰值861.8MiB。无依赖改动，正式服务在构建阶段保持运行。
- 暂停写入后备份 /var/backups/manager/manager-20260929T063738Z.dump 及同名截图归档，验证可读；/opt/manager/data-before-pending-20260929.json 在切换前后验证20张业务表数据一致。
- 无新增迁移，18次全部应用；保留 /opt/manager/standalone-before-pending-20260929 和source-before-pending-20260929.tar.gz。174个源文件SHA-256与本地一致；HTTPS登录200、未登录工作台307，应用/nginx/备份/证书定时器active。未在正式库创建测试业务。

## 2026-09-30 — 账号封禁及分公司写权限复核

- 已实际发布：封禁状态、预计解封日期、展示和执行拦截；上轮K016分公司锁内复核同时发布。与旧线上源文件对比仅上述相关16个新增/修改路径，依赖锁文件相同，未升级依赖。
- stage /opt/manager/build-ban-20260930；manager-ban-build受限1100M/300M swap/100% CPU，webpack单worker/node768M。构建成功标记.ban-build-ok，退出0；耗时126.945秒、峰值831.9MiB。
- 暂停写入后备份 /var/backups/manager/manager-20260929T190635Z.dump 与同名.screenshots.tar.gz（文件名UTC，实际北京时间09-30）；pg_restore --list与tar列表可读。
- 迁移前摘要 /opt/manager/data-before-ban-20260930.json；应用第19次迁移20260929130000_account_ban，迁移后20张业务表所有旧列摘要一致；旧active未改。
- 旧程序 /opt/manager/standalone-before-ban-20260930；旧源码 /opt/manager/source-before-ban-20260930.tar.gz。发布包 /opt/manager/ban-source.tar.gz。新源码196文件SHA-256与本地一致。
- manager/nginx/docker/备份及续期timer active；HTTPS /login 200、未登录/accounts 307。隔离浏览器保存封禁日期和工作空间阻止准备通过；未登录生产修改测试账号。证书续签本次未做实际触发验证。
- 回退限制：新增字段兼容旧结构读取，但旧程序不理解封禁语义。出现问题优先修复，不能在已有封禁数据时把旧版本全功能等价作为保证；不删新增字段和历史。

## 2026-09-30 — 老板打粉数据独立入口

- 实际变动5文件：app/boss/page.tsx、app/live-reports/page.tsx、components/management-shell.tsx、components/monetization-table.tsx、lib/navigation-trail.ts。只改入口/标题/选中/来源，未改schema、权限和查询。
- stage /opt/manager/build-entry-20260930；manager-entry-build沿用1100M/300M swap/100% CPU与node768M限制；退出0、marker和server.js核实，耗时123.666秒，峰值811.4MiB。
- 备份 /var/backups/manager/manager-20260930T054404Z.dump 及同名.screenshots.tar.gz，归档列表可读。摘要 /opt/manager/data-before-entry-20260930.json，暂停写入后20表原列核对一致，19迁移无待应用。
- 旧程序 /opt/manager/standalone-before-entry-20260930；旧源码 /opt/manager/source-before-entry-20260930.tar.gz；源码包 /opt/manager/entry-source.tar.gz。196个部署文件与本地SHA-256一致。
- manager/nginx/docker/备份与续期timer active；HTTPS登录200，未登录打粉视图307。隔离库浏览器首页直达、标题、侧栏唯一选中及切回直播验证通过，未修改正式业务数据。

## 2026-09-30 — 账号列表显示实名人

- 2个业务文件变动：app/accounts/page.tsx新增实名人列与空表11列跨度；modules/accounts/data.ts选择已有realName。权限/历史查询不变，无schema变更。
- 隔离账号回归、typecheck、相关eslint通过；浏览器空值及保存测试姓名后列表显示通过，夹具清理、开发服务停止。未修改正式账号测试。
- stage /opt/manager/build-realname-20260930，manager-realname-build受限1100M/300M swap/100% CPU/node768M；成功退出，耗时121.524秒、峰值843.1MiB。
- 备份 /var/backups/manager/manager-20260930T113403Z.dump及同名.screenshots.tar.gz，归档可读；摘要 /opt/manager/data-before-realname-20260930.json核对20表原列完全一致，19迁移无待应用。
- 旧程序 /opt/manager/standalone-before-realname-20260930；旧源码 /opt/manager/source-before-realname-20260930.tar.gz；源码包 /opt/manager/realname-source.tar.gz。
- 196部署文件哈希一致；manager/nginx/docker/备份及续期timer active；HTTPS/login200，未登录/accounts307。Git提交及推送独立核验，不把基线标签的旧摘要覆盖成新版。

## 2026-09-30 — 账号列表所在手机关联

- app/accounts/page.tsx新增所在手机链接、移除分公司/运营列；modules/accounts/data.ts按deviceScope读取已有PhoneAccountLogin。无新增迁移、无业务写入。
- typecheck、相关eslint、手机关联/导航和账号权限回归通过，新增账号可见但设备不可见的权限断言；测试数据已清理。未另做浏览器目视验收。
- stage /opt/manager/build-accountphones-20260930；manager-accountphones-build沿用1100M/300M swap/100% CPU/node768M，成功退出，130.466秒、峰值838.7MiB。
- 备份 /var/backups/manager/manager-20260930T114701Z.dump及同名.screenshots.tar.gz，归档列表可读；摘要 /opt/manager/data-before-accountphones-20260930.json核对20表原列一致，19迁移无待应用。
- 旧程序 /opt/manager/standalone-before-accountphones-20260930；旧源码 /opt/manager/source-before-accountphones-20260930.tar.gz；源码包 /opt/manager/accountphones-source.tar.gz。
- 196部署文件哈希一致；manager/nginx/docker/备份及续期timer active；HTTPS登录200、未登录账号页307。

## 2026-09-30 — 手机号列表所在手机

- components/number-directory.tsx替换分公司列；modules/resources/data.ts按deviceScope批量查询本页卡槽位置，支持otherPhone原登记文本。无结构变更。
- 类型/相关eslint、手机关联导航权限及手机号专项回归通过；初次测试路径误写为test-numbers.ts未执行，纠正为test-number-management.ts后通过。测试数据清理；未另做浏览器目视验收。
- stage /opt/manager/build-numberphones-20260930，manager-numberphones-build成功退出；资源限制1100M/300M swap/100% CPU/node768M，134.304秒、峰值842.7MiB。
- 备份 /var/backups/manager/manager-20260930T115823Z.dump及同名.screenshots.tar.gz，归档可读；摘要 /opt/manager/data-before-numberphones-20260930.json，20表原列一致，19迁移无待应用。
- 旧程序 /opt/manager/standalone-before-numberphones-20260930；旧源码 /opt/manager/source-before-numberphones-20260930.tar.gz；源码包 /opt/manager/numberphones-source.tar.gz。
- 196部署文件哈希一致，manager/nginx/docker/备份及续期timer active，HTTPS登录200、未登录手机号列表307。

## 2026-10-01 老板管理框架与交互修复发布

- 内容：第一阶段侧栏/顶栏/页面外框，以及独立审查R1–R4修复；不改首页数据查询、权限、schema或依赖。
- 构建：manager-bosslayout-build，MemoryMax=1100M、MemorySwapMax=300M、CPUQuota=100%、Node堆768MiB；webpack构建退出0，耗时134.058秒，内存峰值806MiB。
- 暂停写入后备份：/var/backups/manager/manager-20260930T193802Z.dump及同名.screenshots.tar.gz（实际服务器文件名）；pg_restore --list与tar目录检查通过。
- 数据：/opt/manager/data-before-bosslayout-20261001.json，20张业务表在切换前核对一致；19个迁移无待执行，无新增迁移。
- 回退：/opt/manager/standalone-before-bosslayout-20261001，源码/opt/manager/source-before-bosslayout-20261001.tar.gz；部署错误钩子可恢复旧standalone。本次未触发回退。
- 发布后：199个部署源文件SHA-256与本地一致；manager/nginx/docker/backup.timer/cert-renew.timer active；有效HTTPS /login 200、未登录/boss 307。未在正式库造验收数据；交互验证在隔离库完成，范围见current-status.md。timer active不代表本次实际完成续期。

## 2026-10-01 中控调整发布完成

独立上班/下班、精简侧栏、个人资料及账号中控可选已上线。受限构建128.828秒，峰值844.3MiB；备份 /var/backups/manager/manager-20260930T222321Z.dump 及同名.screenshots.tar.gz，归档目录检查通过（未做完整恢复演练）。20张业务表原列摘要 /opt/manager/data-before-controllerprofile-20261001.json，迁移前后相同；20次迁移到位。206部署文件哈希一致，manager/nginx/docker及两个timer active，HTTPS登录200、未登录个人资料307。

旧程序 /opt/manager/standalone-before-controllerprofile-20261001，旧源码 /opt/manager/source-before-controllerprofile-20261001.tar.gz。产生空中控账号后旧程序回退需空值兼容，见operations.md。正式库未造测试数据。隔离浏览器覆盖上下班、资料保存刷新与错误保留输入；密码复用既有认证测试，未通过浏览器改密。夹具清理、3103停止。代码提交80cb241，发布文档随后同步main。

## 2026-10-01 D046上班清单与下班规则发布

- 正式迁移21：20261001070000_shift_checklist，仅新增WorkShift三个可空字段；无历史回填。受限webpack构建129.594秒，CPU123.787秒，峰值834.4MiB；成功marker、退出0及server.js均核验后才切换。
- 停止应用写入后备份：/var/backups/manager/manager-20260930T230830Z.dump 及同名.screenshots.tar.gz。pg_restore --list和tar目录检查通过；不代表本次完整恢复演练。
- 20张业务表全部旧字段迁移前后摘要一致：/opt/manager/data-before-shiftchecklist-20261001.json。迁移状态21项全部到位，无测试资料写入正式库。
- 保留旧程序/opt/manager/standalone-before-shiftchecklist-20261001、旧源码/opt/manager/source-before-shiftchecklist-20261001.tar.gz。未触发回退；旧版不执行8小时/四项完成门槛，回退语义限制见operations.md。
- 207个部署文件SHA-256与本地一致；manager/nginx/docker及备份/续期timer active；HTTPS证书正常，/login 200，未登录/workbench/attendance 307。timer active不代表此次完成证书续期。
- 隔离库完成专项、关联回归和桌面浏览器交互；测试夹具清理、3103服务停止。截图在本机/tmp/manager-shift-checklist-complete.png、/tmp/manager-shift-checklist-history.png，仓库外。代码与文档同次提交main，不把Git推送当成上线证据。

## 2026-10-01 隐藏已工作时长与下班倒计时

仅删除显示行及其格式化函数，内部计时、8小时校验、提前下班入口不变；无数据库迁移（仍21项）。typecheck、组件eslint、diff检查通过；受限构建129.410秒、峰值831.4MiB。备份/var/backups/manager/manager-20261001T004407Z.dump及同名.screenshots.tar.gz，归档可读但未做完整恢复演练。20表全部旧列摘要核对一致（/opt/manager/data-before-shift-display-20261001.json）；207文件哈希一致，manager/nginx active，HTTPS登录200、未登录上班页307。旧程序/opt/manager/standalone-before-shift-display-20261001及旧源码source-before-shift-display-20261001.tar.gz保留。未重跑业务测试矩阵或浏览器，本次无本地临时服务。代码与文档同次提交推送main。
## 2026-10-01 D047直播工作页面精简发布

三列精简账号卡片、区域滚动及执行中控底部待收尾上线。无schema、依赖、权限或写服务变更，迁移仍21项。typecheck、相关eslint、本地生产构建、隔离HTTP、桌面1280×720及窄屏390×844验收通过；未重跑完整业务矩阵。

受限构建133.365秒，峰值837.8MiB；备份/var/backups/manager/manager-20261001T071539Z.dump及同名.screenshots.tar.gz，归档目录可读，未做完整恢复演练。20表原数据核对一致，摘要/opt/manager/data-before-homecompact-20261001.json。旧程序/opt/manager/standalone-before-homecompact-20261001、旧源码/opt/manager/source-before-homecompact-20261001.tar.gz保留。

207部署文件哈希一致，manager/nginx/docker及两个timer active；HTTPS登录200、未登录/controller 307。timer active不代表本次续期成功。正式库未造测试资料；隔离夹具已清理、3103停止。截图/tmp/manager-controller-home.png不入库。代码4d4ed29已同步main，发布文档随后同步。

## 2026-10-01 D050老板场次管理与上班检查简表

- stage /opt/manager/build-sessionmanagement-20261001；unit manager-sessionmanagement-build webpack成功退出0，135.920秒，839.1M峰值；资源上限1100M/300M swap/100%CPU/node768M。依赖锁哈希与前版一致，未升级依赖。
- 暂停写入后备份 /var/backups/manager/manager-20261001T142455Z.dump 及同名.screenshots.tar.gz，pg_restore --list及tar目录可读。
- 旧数据摘要 /opt/manager/data-before-sessionmanagement-20261001.json，迁移前后20张业务表全部原列一致；迁移23新增WorkSession七个可空字段，无回填。migrate status无待执行项。
- 旧程序 /opt/manager/standalone-before-sessionmanagement-20261001；源码 /opt/manager/source-before-sessionmanagement-20261001.tar.gz。新增软删除启用后旧程序不具备过滤语义，优先向前修复，禁止为了回退删除新数据。
- 218个部署文件哈希一致；截图目录应用用户独立读写探针通过；manager/nginx/backup timer active，HTTPS登录200，未登录管理列表307。生产未写入测试场次。
- standalone构建复制的.env已从新程序包剔除，服务仍通过/etc/manager/app.env注入配置，未输出凭证、未修改源配置。
- 桌面与隔离验收见[tasks/session-management-verification.md](tasks/session-management-verification.md)。源代码与文档本次同步GitHub；Git提交与生产发布分别核验。

D050对应源码提交：744c6db4c2969e750c71ee88b657db02e93539f0，已同步origin/main且远程一致；后续纯文档交接提交不触发再次部署。

## 2026-10-02 D051 导粉填报精简与画像

- 发布：北京时间02:03左右；中文时长、画像、统一八比例、旧字段只读保留、旧完成兼容及待补口径同步上线。
- staging：`/opt/manager/build-audience-20261002`；依赖锁与上版SHA256一致，复用锁定依赖；manager-audience-build成功退出0，134.431秒、837.2MiB峰值，原资源限制不变。
- 暂停写入后备份：`/var/backups/manager/manager-20261001T180251Z.dump` 与同名`.screenshots.tar.gz`（文件名UTC）；pg_restore列表、截图tar列表均可读。
- 数据摘要：`/opt/manager/data-before-audience-20261002.json`；增量迁移`20261002010000_report_audience`后24迁移无待执行，20张业务表全部原列摘要一致。
- 旧程序：`/opt/manager/standalone-before-audience-20261002`；旧源码：`/opt/manager/source-before-audience-20261002.tar.gz`。不删除旧字段及截图，不回填画像。
- 应用用户截图读写探针通过；221个部署源文件SHA256一致（`/opt/manager/manager-audience-hash.py`）；standalone不含.env。manager/nginx/备份/续期timer active；HTTPS登录200、未登录/leads307。timer检查不代表本次执行续期。
- 本轮桌面功能在隔离库完成，生产未创建测试业务记录。隔离测试及范围见[tasks/report-metrics-verification.md](tasks/report-metrics-verification.md)。

D051源码提交：97880635db50ab70f428f24ef3019624c3f902b2，已推送origin/main且远程一致。后续交接文档提交不改变部署源码。


## 2026-10-02 D052 人员统计、确定数据与主播空间

- 北京时间14:46切换；服务地址仍为https://8.163.69.11。源码范围244文件SHA核对一致，依赖锁未改变。
- staging `/opt/manager/build-settlements-20261002`，受限webpack构建141.283秒、峰值890MiB；unit退出0及专属marker确认，服务继续运行至最终备份阶段。
- 暂停写入后备份 `/var/backups/manager/manager-20261002T064641Z.dump` 与同名 `.screenshots.tar.gz`；pg_restore --list和截图tar目录可读。没有做本次完整恢复演练。
- 原数据摘要 `/opt/manager/data-before-settlements-20261002.json`，20张原业务表全部原列与行数一致。新增两次追加迁移至26：20261002030000_confirmed_leads、20261002031000_legacy_report_people。没有回填历史主播或改写指标。
- 旧程序 `/opt/manager/standalone-before-settlements-20261002`，旧源码 `/opt/manager/source-before-settlements-20261002.tar.gz`。
- 截图应用用户独立读写探针通过；standalone不含.env；manager/nginx/backup timer/cert renew timer active。HTTPS登录200、未登录settlements与anchor为307。timer启用不表示本次已完成证书续期。
- 隔离桌面浏览器与业务验证见 [D052验收](tasks/settlements-verification.md)，未在正式库建立测试员工/场次/确定数据。Git提交与推送另见current-status.md。

D052源码对应Git提交8cf29805fdfe89c44a0bf02b80a84dcdfe6d5647，已推送origin/main，远程与本地一致；后续纯交接文档提交不改变生产程序。

## 2026-10-02 D053 移除后端链接

- 北京时间15:26发布，独立stage `/opt/manager/build-backend-links-20261002`，受限webpack构建150.820秒，峰值906.6MiB。
- 备份 `/var/backups/manager/manager-20261002T072603Z.dump` 与同名截图包；旧程序 `/opt/manager/standalone-before-backend-links-20261002`、源码归档 `/opt/manager/source-before-backend-links-20261002.tar.gz`。
- 暂停写入后核对 `/opt/manager/data-before-backend-links-20261002.json`：22表全部原列一致；26迁移、无新增/待执行；244文件SHA一致。截图用户读写探针通过，standalone无.env，manager/nginx及两个timer active，HTTPS登录200/未登录后端页307。
- 本地类型、相关lint、确定数据专项通过（无链接新增、历史链接保留、金额/权限/并发/审计/回收站）；本次未重复浏览器全矩阵。生产没有测试数据写入，日常开发库未修改。

D053备份pg_restore目录及截图tar均可读取，旧程序保留；代码28a8500已推送并核对远程一致。此次只核验备份可读，未完整恢复演练。


## 2026-10-02 D054 支持不导粉场次

- 北京时间16:11发布；stage `/opt/manager/build-lead-mode-20261002`，受限webpack构建148.308秒、峰值908.3MiB，退出0与marker确认后切换。
- 停止写入后备份 `/var/backups/manager/manager-20261002T081143Z.dump` 与同名截图包；原数据摘要 `/opt/manager/data-before-lead-mode-20261002.json` 核对22张业务表全部原列一致。
- 只追加 `20261002080000_report_lead_mode`，共27迁移，无回填和旧指标变更。245部署文件SHA一致，standalone无.env。
- 保留旧程序 `/opt/manager/standalone-before-lead-mode-20261002` 与旧源码 `/opt/manager/source-before-lead-mode-20261002.tar.gz`。
- 截图应用用户读写探针通过，manager/nginx/backup timer/cert timer active；HTTPS登录200、未登录leads和live-reports307。未在生产造测试数据。timer active不等同续期成功。
- 实测范围见 [D054验收](tasks/lead-mode-verification.md)，含桌面浏览器，不包括真机移动端；日常开发库未迁移，隔离测试库27迁移。
- 备份pg_restore目录及截图tar可读取；本次未做完整恢复演练。

D054生产源码对应fdd63b5fc892b1fa46f5fdfb12cb06f468baed76，已同步origin/main；后续纯文档提交不改变程序。
