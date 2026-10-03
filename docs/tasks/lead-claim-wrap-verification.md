# D059 收尾与导粉认领验收

2026-10-04，已发布D059。

- 隔离迁移：scripts/test-lead-claim-migration.ts，新临时库验证25张旧表全部原列守恒，旧LeadTask草稿和人员不变，新三列为空；临时库已清理。
- 隔离业务：test-leads（含D059确认/实际人员/撤销/重认领/版本/权限/审计/中控报表保留）、test-reporting-role、test-work-evidence（四种异常证据复用）、test-session-management、test-live-reports、test-external-direct、test-settlements通过；test-preview-proxy通过。
- 类型、相关eslint、diff检查、本地webpack生产构建通过。测试库30迁移，日常本地库未迁移。
- 浏览器：真实PNG异常下播上传、数据页收尾位置、未填直播数据阻止收尾、提交指标后复用原截图完成；导粉模式收尾仍在下播后；确认页刷新不认领、默认本人、选其他员工、保存草稿、撤销后重新认领空白、老板中控/导粉预览。截图 /tmp/manager-d059-ui（不提交）。测试驱动首次因同步等待浏览器confirm停住，改为异步触发并监听对话框。完整串行验收另外发现保存草稿后撤销表单版本未刷新，给命令表单按任务版本重建，重新构建后13项浏览器断言全部通过。
- 测试开发过程：一次夹具复制报表时重复账号开播时间，修正夹具后通过；一次误调用不存在的test-external-preview.ts，随后执行实际test-external-direct.ts通过。无生产测试业务写入。

文档链接和差异/敏感检查通过；测试夹具及3103/9334临时进程清理完毕。原reporting夹具清理未覆盖本次浏览器新增截图，首次受外键保护拒绝；先按本轮marker清理截图后重新执行通过。发布已完成：30迁移、25旧表守恒、269文件SHA一致，健康200/307。备份manager-20261003T191524Z及旧程序保留，详见../deployment.md。待完成Git提交与远程同步。
