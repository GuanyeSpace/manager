# 生产运行、发布与恢复手册

整理日期：2026-09-29。以下为最近实际使用的环境与流程；任何操作前实时核对，不把历史服务状态当作当前正常。发布证据按次追加 deployment.md。

## 1. 正式环境位置

| 项目 | 当前记录 |
| --- | --- |
| 公网地址 | 8.163.69.11，https://8.163.69.11 |
| 平台/系统 | 阿里云 ECS，Ubuntu26.04，amd64，2核/标称2GiB，另有2GiB swap |
| SSH | root + 专用密钥；本机 ~/.ssh/manager_server_ed25519 |
| 固定主机指纹 | ~/.ssh/manager_server_known_hosts；最初经云控制台截图核对 |
| 当前源码 | /opt/manager/app |
| 运行程序 | /opt/manager/app/.next/standalone/server.js，manager-app 用户 |
| 应用配置 | /etc/manager/app.env，不入库，不输出内容 |
| 数据库配置 | /etc/manager/database.env，不入库 |
| PostgreSQL | Compose项目manager，/opt/manager/compose.yml，回环5433，持久卷manager_manager_data |
| Web入口 | Nginx80/443；应用只监听127.0.0.1:3000 |
| 持久截图 | /opt/manager/uploads/work-screenshots |
| 备份 | /var/backups/manager；数据库.dump+同名.screenshots.tar.gz |
| 系统服务 | manager、nginx、docker；manager-backup.timer、manager-cert-renew.timer |
| 证书工具 | /opt/certbot/bin/certbot，IP短期证书 |

可以记录公有IP、路径和服务名；严禁把私钥内容、数据库密码、SESSION_SECRET、登录Cookie复制进文档。其他 AI 所在电脑不一定有此密钥，应由用户提供安全访问方式，不能禁用主机指纹检查。

## 2. 只读健康检查

```bash
systemctl is-active manager nginx docker
systemctl list-timers 'manager-*'
journalctl -u manager --since today --no-pager
/opt/certbot/bin/certbot certificates
curl -sS -o /dev/null -w '%{http_code}
' https://8.163.69.11/login
```

登录页应200；未登录访问受保护资源通常307跳转。真实会话/业务数据检查使用授权身份，不用新建正式测试员工。不得用 curl -k 掩盖证书故障。

## 3. 备份

- deploy/backup.sh 为源码模板；已安装脚本 /opt/manager/backup.sh。定时器记录为每天北京时间03:00，保存约14天；更新前核对实际timer。
- 备份脚本先pg_dump自定义格式再归档截图，使用临时文件完成后重命名。发布暂停写入期间执行以便文件和DB一致；日常不停写入备份的跨文件一致性需恢复时核对。
- 只看到.dump文件不算备份验证：检查pg_restore --list可读，截图tar可列出；重要变更做隔离库恢复演练。
- verify-existing-data.mjs 只保存表行数和内容摘要，不是数据备份；不能用摘要恢复业务。
- 当前同机备份不足以应对整机丢失。异机备份未落地，属于后续运维事项。

## 4. 小内存构建

曾直接在服务器构建导致无响应，禁止无资源限制构建。

两种已使用方案：

1. 本地 Docker Linux amd64/Node22 构建，使用 deploy/build-linux.sh。输出standalone压缩包，不携带开发.env，不上传macOS node_modules。
2. 服务器独立 staging 目录，在服务仍运行时受限构建：webpack、单worker，systemd MemoryMax=1100M、MemorySwapMax=300M、CPUQuota=100%，NODE_OPTIONS=--max-old-space-size=768。最近09-29约127秒，峰值878.2MiB；是历史值，不是新构建保证。

服务器 staging 示例命名 `/opt/manager/build-<主题>-<日期>`；构建unit `manager-<主题>-build`；成功才创建专属marker。不要覆盖其他在用stage。

依赖未变化时最近发布复用了服务器锁定依赖（硬链接 node_modules）；**依赖有变化时不要在硬链接目录里npm ci或升级，避免破坏运行环境**，应使用独立安装或本地Linux构建。必须先比较package-lock，再决定。

Prisma generate在stage生成；应用包需要public和.next/static一同放进standalone对应目录。构建退出码0、unit成功、server.js与成功marker同时存在才进入切换。

## 5. 标准发布顺序

这是执行清单，不是可盲跑的自动脚本；每次需根据迁移和实际路径生成本次发布方案。

1. 本地验证改动，确认本次范围与无关变更；记录源码/依赖/迁移集合，排除.env、.git、node_modules、.next、app/generated及临时测试资料。
2. 检查服务器可用磁盘、内存、备份、应用健康及当前迁移。保留当前可恢复程序；确认无其他发布正在运行。
3. staging构建完成；为本次指定独立source包、stage、旧程序、摘要路径。源码归档保护现有实现。
4. 准备失败恢复路径，再短暂停止manager写入；执行数据库+截图备份。
5. 在旧结构上运行 `node deploy/verify-existing-data.mjs snapshot <新摘要路径>`，记录所有原有列与行摘要。
6. 只用锁定Prisma执行 `prisma migrate deploy` 与 `migrate status`。禁止生产reset/dev/db push/seed。
7. `verify-existing-data.mjs verify <同摘要路径>` 必须通过；若预期确实要改旧数据，需在事先明确授权和专门验收方案中列出，不得直接忽略差异。
8. 原standalone移动到本次旧程序路径，新standalone切入；同步匹配源码与生成客户端、文件权限。不要动uploads或数据卷。
9. 启动manager，检查回环/login，再HTTPS证书、登录页、受保护路由重定向、服务/定时器。
10. 验证备份可读、源文件对应、迁移结果，记录实际执行证据；需要时再比摘要，但恢复写入后真实用户变更也会导致差异，应区分合法新写入和迁移破坏。
11. 更新deployment.md、current-status.md、CHANGELOG.md；新版本用户功能是否浏览器验收单独注明。

## 6. 失败处理与回退

- 构建失败：不停止当前正常程序，不执行迁移，查unit日志与内存，不取消限制重试。
- 迁移失败：检查_prisma_migrations与实际SQL状态，保持备份；不删除迁移目录或直接mark applied掩盖问题。
- 新程序无法启动：若新增迁移兼容，可恢复之前standalone并启动；记录已应用迁移仍保留，**程序回退不等于数据库回退**。
- 多岗位、导粉等新功能已有正式数据后，旧程序可能不能识别其语义。优先修复当前版本，不能声称回切旧程序业务完全等价。
- 恢复数据库是高影响操作，不因检查失败自动覆盖正式库。先在独立环境恢复并验证，经明确恢复方案再处理正式环境。
- 回退也要保留新版本写入的数据与截图，不物理丢弃。不能rm数据目录、删卷或执行compose down -v。

## 7. 恢复演练验收

在新的隔离数据库及独立截图目录恢复，验证迁移版本、表/记录、关键外键、代表性业务快照和截图能读取。应用如需演练也使用隔离配置。完成后仅清理本轮演练对象；检查“归档能列出”不等于“完整恢复演练成功”。历史首次部署做过恢复演练，最近09-29核验的是归档可读与原数据不变。

## 8. 已知运维限制

- IP证书有效期短；timer active只表示启用，不保证续期成功。此前ACME网络超时使用临时转发解决过，不能假定永久修复，详见known-issues与发布日志。
- 没有异机备份、持续告警或自动恢复闭环；不要在交接里写成已具备。
- 首次空库初始化脚本仅供真正全新环境，不适用于当前生产更新。
- 运行路径和SSH密钥依赖当前机器；复制项目给另一AI后还需授权环境访问，不能从仓库获得生产密码。

## 2026-09-30 封禁版本回退注意

当前程序保留active且新增banned/unbanDate，迁移19。旧版将封禁看作停用，编辑时可能不保留完整封禁语义，因此旧程序仅为应急恢复点，不代表业务等价；不得删字段或改历史以回退。最新备份/摘要/旧程序路径见deployment.md本次记录。

### 2026-10-01可空中控版本的回退注意

本版开始允许正式账号controllerId为空。旧版本存在controller.name非空假设：一旦产生空中控账号，不应直接切回旧二进制作为长期回退。应保留当前数据、优先修复向前；必要时给旧程序补空值兼容后再启用，不能为了旧版本运行而删除账号或给空中控伪造人员。个人资料新增列可保留，无需回退迁移。

### D046上下班版本回退注意

新增WorkShift三列均可空，迁移不更新旧行。旧未结束记录按createdAt计时；缺少历史检查完成时间时明确展示未记录。若回退旧程序，8小时及四项完成限制不再生效、提前结束原因也不能完整展示，所以优先修复向前。不得为回退删除新列、审计或提前下班记录。正式迁移前暂停写入、备份数据库与截图，并比较全部旧表原有列摘要。

### 截图目录发布检查（D048）

每次发布激活前以root执行 `bash deploy/check-screenshot-storage.sh`：父目录/opt/manager/uploads为root:manager-app 750，截图目录manager-app:manager-app 700，现有截图文件权限不递归变动。脚本用应用用户创建、读回并删除独立临时探针，不写业务表。原先父目录root:root 750会导致应用EACCES，即使子目录owner正确也无法上传。不要在后续部署中重新创建为root组；不要chmod -R或放开给所有用户。数据库与截图仍须先备份、旧数据仍须核对。

### D050场次软删除版本回退注意
迁移23仅加可空列，原值保留。但旧程序不认识场次deletedAt，启用回收站后直接回退旧程序会重新显示已删除场次并绕过关联保护。优先向前修复；应急回退前评估是否已有删除/补录记录，不得清空新列或删除业务记录以兼容旧程序。

## D051 画像版本回退注意（2026-10-02）
画像迁移是可空新增列，原字段不变。保留的上一版程序只用于应急恢复；旧导粉保存逻辑会重建JSON，可能丢失新增画像/表单版本，且旧点击率分母不同，因此已有新数据后优先修复当前版。不得删除画像列或恢复旧数据库覆盖新填报。实际备份、摘要、旧程序路径见deployment本轮记录。


## D052确定数据版本回退注意（2026-10-02）

26次迁移为兼容追加；应急旧程序在 `/opt/manager/standalone-before-settlements-20261002`，具体备份见deployment.md。新增实际主播、后端和每日确定数据一旦有正式写入，旧程序不理解这些语义；优先修复新版本，不删表/字段，不用回退数据库覆盖新业务。金额以整数分计算，主播可见字段由服务端限定，恢复程序时不得绕过权限。

## D054是否导粉的回退注意（2026-10-02）

27迁移只新增可空isLeadGeneration；不导粉旧人数仍保留。旧程序不会排除这些人数，回退可能误统计或要求补齐打粉指标，因此只能应急使用，优先修复新程序，不删字段或恢复旧数据库覆盖新记录。备份/旧程序具体路径见deployment.md D054。

## D055 发布经验
执行包含docker compose exec -T的发布脚本时，先上传独立脚本再执行，不以ssh bash -s传整段脚本：子进程可能消费脚本标准输入，导致备份后剩余步骤未执行。本次首次执行停在备份后，立即恢复旧服务，再使用独立脚本完成迁移发布。发布后必须独立核对服务、迁移、源码，不能仅凭SSH退出码。
预览回归需覆盖Next内部重写二次经过proxy的签名上下文，以及直接POST、失效会话和截图落盘前的写鉴权。

## D056预览发布核验
必须覆盖完整重写地址/boss/preview/controller/<员工ID>/view/controller（以及leads/anchor），仅检查员工选择页307不足以验证。生产不得建立测试员工；无会话使用不存在目标的完整路径应安全跳登录而非500，真实权限与交互在隔离库HTTPS反代验收。公网TLS仍正常校验证书，不使用-k。keep skipProxyUrlNormalize与proxy原始URL重写成对维护，避免127.0.0.1规范化为localhost使Next误判外部代理。
