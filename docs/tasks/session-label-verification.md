# D064 场次名称验收（2026-10-06）

仅修改展示：原自动格式YYYY-MM-DD HH:mm 场使用实际开播北京时间；未开播与手工名称保留。报表使用既有reportPeople解析后的实际场次时间；表单、保存、审计原值不替换，无迁移。

## 本次验证
- lib/session-label.test.ts：2项通过，覆盖跨凌晨、分钟精度、更正时间随动、未开播及手工/类似自动但带后缀的名称保留。
- 类型检查、相关eslint、差异检查及macOS生产webpack构建通过。
- 隔离库＋生产构建桌面浏览器14项：中控首页、历史、工作空间、待收尾、未开播、自定义名称、导粉列表及详情、老板场次、直播/打粉列表、独立报表详情及只读预览。准备2026-10-03 23:40、实际开播2026-10-04 00:03的名称一致，截图目视通过。
- 浏览器读取后核对：WorkSession.label、LiveReport.sessionLabel、报表原startedAt及entryCount原值不变。测试夹具首轮独立报表因重复账号/时间唯一键创建失败，调整隔离夹具的原报表时间后重测通过，未修改业务约束。
- 报告/截图在仓库外/tmp/manager-d064-ui，脚本/tmp/manager-d064-browser.mjs。隔离测试用户已清理为0。

## 发布状态
2026-10-06 01:08已发布，功能提交87fff5b936c6286589c7bc4cd9f360f0b120a9eb已推送并核对远程一致。Linux构建首次停在Prisma引擎下载；复用服务器相同版本（0edf323efd1d98336f3f0a68684b56f689b900d3）Linux工具到本地容器，指定PRISMA_SCHEMA_ENGINE_BINARY，离线锁文件安装及webpack构建成功。未在生产编译、未升级依赖。

- 备份：`/var/backups/manager/manager-20261005T170822Z.dump`及同名`.screenshots.tar.gz`，pg_restore目录和tar可读。
- 旧程序：`/opt/manager/standalone-before-d064-20261006`；旧源码：`/opt/manager/source-before-d064-20261006.tar.gz`。
- 摘要：`/opt/manager/data-before-d064-20261006.json`，25表原列一致；275部署文件SHA一致，无迁移。
- 截图应用用户读写探针通过；manager/nginx/docker及备份/续期timer active；HTTPS登录200、未登录场次页307。
- 利用已有老板会话在服务器内发起认证公网HTTPS只读请求，3条真实场次标题与数据库实际开播北京时间一致；不输出Cookie，不新增员工会话或业务记录。线上为HTTP内容核验，浏览器14项在隔离环境完成。
- 临时应用3103、Chrome9334、签名夹具及Chrome profile已清理，隔离测试用户0；保留仓库外验收报告和构建缓存。原`.claude/launch.json`删除继续排除。
