# D066 保持登录验收

## 排查与隔离验证（2026-10-16）
- 旧版生产构建，在隔离库经HTTPS代理实际用户名密码登录，Cookie为7天、持久/Secure/HttpOnly，完全关闭Chrome并同profile重启后直接进入工作台。关闭即失效未复现。
- 生产只读核查：HTTP301转HTTPS、Nginx Host和X-Forwarded-Proto正确，登录200。未用正式员工密码测试或修改正式会话。
- 第34兼容迁移前后25表旧列摘要一致，旧会话标记false，不修改旧期限。
- scripts/test-session-renewal.ts通过：30/7天、每日只延一次、多窗口、过期/退出拒绝、改密保留、重置交叠及离职拒绝；续期不增加登录审计。
- scripts/test-auth-concurrency.ts、test-auth-overlap.ts及其故障诊断test-auth-overlap-fault.ts全部通过。类型检查、相关eslint、macOS生产构建通过。
- 新版HTTPS代理浏览器验证：默认勾选30天、真实登录关闭重开保留、续期204、缺头403、伪造预览头/预览Referer403、退出后401、取消勾选7天。将隔离会话期限置为待续后，真实接口同步浏览器到期为30天。登录截图/tmp/manager-d066-login.png已目视检查，不提交仓库。
- 未模拟整机重启、非Chrome浏览器或员工现场设置；真实浏览器进程关闭重启已验证。隔离自签证书仅测试Chrome允许，正式HTTPS仍正常校验证书。

- 最后审查将到期复核时间移至取得用户锁之后，避免等待锁期间过期仍被续期；专项和构建重跑通过，最终版本浏览器完整重跑通过。隔离夹具已清理，3103/3443/9334服务及临时浏览器已停止；凭证文件已删除。

## 发布状态
2026-10-16 19:02已上线，2026-10-17补齐发布记录。

- Linux amd64本地Docker构建退出0，资源限制3GiB/2CPU；未在正式服务器构建。构建中会话服务源码与最终本地SHA一致。功能提交dcd2d363120dd2d36bae8682a98c5e61ec2c55dd已推送main并核对远程。
- 备份：/var/backups/manager/manager-20261016T110214Z.dump及同名.screenshots.tar.gz。pg_restore --list和tar清单可读；非完整恢复演练。
- 旧程序：/opt/manager/standalone-before-d066-20261016；旧源码：/opt/manager/source-before-d066-20261016.tar.gz；原列摘要：/opt/manager/data-before-d066-20261016.json。
- 第34迁移到位，暂停写入期间25张业务表原列前后两次核对一致，旧会话原期限保留。280部署文件SHA一致。
- manager/nginx/docker及备份、续期timer active；HTTPS登录200、未登录老板页307。正式登录页保持登录选项、续期无会话401、跨源403、缺请求头403验证通过，未创建正式测试用户或修改正式会话。
- 截图应用用户读写探针通过；本地测试夹具、临时服务及构建容器已清理，D066测试用户残留0。生产临时只读检查脚本已删除。未执行证书续期，不将timer active视为续期验收。
- 员工反馈的关闭即失效在受测环境未复现；本轮改善固定期限和持续使用体验，不宣称已确认或修复现场浏览器根因。
