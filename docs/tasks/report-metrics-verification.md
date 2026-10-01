# D051 导粉填报精简验收（2026-10-02）

## 本次范围
中文时长、五组紧凑输入、两项画像、八项统一比例；旧字段和审计保留，历史完成兼容，原权限/认领/版本/删除规则不变。迁移仅增加两个可空整数及范围约束。

## 实际验证
- `scripts/test-report-metrics.ts`：中文时长缺省单位/错误、旧三段回显、百分号、0/100边界/越界/精度、八项公式、零分母/零分子通过。
- `scripts/test-report-audience-migration.ts`：临时独立库应用旧23个迁移后升级24，核对20张业务表全部原列，原有报表新画像NULL，范围CHECK拒绝越界；清理通过。
- `scripts/test-leads.ts`：新完成画像必填、不能清空、旧完成允许缺画像更正、补齐后不可清空、未知JSON/长按/GMV保留；原并发认领/编辑、岗位分公司权限、删除恢复、审计与回滚通过。
- `scripts/test-live-reports.ts`、`scripts/test-workbench.ts`、`scripts/test-session-management.ts`通过。待补规则按D051去除长按/带货，仍检查其他缺项、删除和待收尾。
- typecheck、变更文件ESLint、diff check通过；本地生产构建通过，保留既有截图路径Turbopack动态文件追踪警告，未在本次扩大修复。
- 1440×900 headless Chrome + `next start`（隔离库）实际交互通过：三列布局、时长粘贴、八比例、画像空值拒绝、错误保留输入、保存草稿/刷新、提交完成/刷新、更正进房人数与粉丝/打粉比例联动、老板直播及打粉报表一致。截图4张位于`/tmp/manager-audience-ui/`，测试脚本`/tmp/manager-audience-browser.mjs`，不入库。
- 本轮未另做真机移动端验收；服务器不创建测试员工或业务场次。

## 验证期间发现与处理
浏览器夹具尚未清理时重跑live-reports，旧测试全库数量断言得到2而非1；清理本轮夹具后单独重跑，避免将隔离夹具误判为产品回归。
隐藏带货输入后，新旧场次待补查询与moneyPending须同时去除旧带货/长按条件，已调整并回归。旧测试“旧报表未填带货仍待补”与D051冲突，更新为新规则并继续检查旧GMV不被改动。

发布与备份证据见 [deployment.md](../deployment.md)。
