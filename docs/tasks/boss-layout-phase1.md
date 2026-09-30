# DeepSeek实施提示词：老板工作台布局改版第一步

状态：2026-10-01用户已确认范围，待实施；本文件本身不是完成报告。

你是本项目的实施者。请实际完成以下改动、自测、文档同步和开发分支推送，不要只输出建议。最后由Codex独立审查和部署。

## 1. 基线与安全边界

- 仓库：https://github.com/GuanyeSpace/manager.git。本提示词编写时源码基线为c1b8c8d0b8d42daab37adf20065fa47df1e387f8，其后本提示词及确认记录为纯文档提交。
- 开始先检查git status、当前分支及HEAD，fetch origin；以包含本任务文档的最新origin/main建立独立分支feat/boss-layout-phase1。如分支已存在先核对归属，不覆盖；发现新增业务差异先检查是否影响方案。记录实际基准SHA。
- 保留已有修改；.claude/launch.json本地删除已明确排除，不恢复、不提交。不得git add .、force push、reset --hard或clean。
- 不读取生产凭证、私钥，不连接生产服务器或正式数据库，不部署，不合并main。数据库测试仅用确认后的本机隔离_test库。无schema变更、无新迁移、无依赖升级。
- 先读AGENTS.md、docs/README.md、docs/current-status.md、docs/development-guide.md、docs/boss-workspace-proposal.md、docs/business-rules.md、docs/decisions.md。最新确认以本任务和D043为准。
- 写Next代码前阅读node_modules/next/dist/docs/中相关Server/Client Components、导航和布局指南。依赖以package-lock.json为准。

## 2. 已确认范围

只改管理端侧栏、顶部导航和页面外框。数据总览延期，等用户测试数据后另行确认。

必须保留app/boss/page.tsx现有内容、三个统计卡片、数据查询、计算口径及快捷入口；不要新增统计、图表、异常提醒、待补数量，不要重做首页。不能改变权限、服务查询、表单字段或关联数据。

主要修改components/management-shell.tsx；必要时提取少量专用展示组件。优先复用已安装的lucide-react、radix-ui及现有UI组件，不新装组件库、不重构全站样式。

## 3. 侧栏结构与路由（保持全部16个入口）

独立置顶：工作台 /boss。

- 直播业务：抖音账号 /accounts；账号流程与话术 /account-config；直播间 /resources/rooms；场次执行记录 /workbench/history；上班检查记录 /workbench/shifts。
- 数据统计：直播数据 /live-reports；打粉数据 /live-reports?view=monetization；导粉任务 /leads。
- 设备与物资：手机 /resources/phones；手机号 /resources/numbers；电脑与设备 /resources/equipment；办公物资 /resources/materials。
- 组织人员：员工 /boss/users；主播 /resources/anchors；分公司 /boss/branches。

这是菜单展示名调整，不重命名路由和业务实体。侧栏直接进入模块首页，不携带上一个模块的via或筛选条件。

桌面>=1024px左侧224px，顶部品牌“星熠传媒”，副标题“业务管理系统”。四组标题弱化，菜单行约36–40px，图标约18px；选中项浅色底、加深文字，保持清晰对比度。分组可折叠，默认展开，路由切换时当前项所在组必须展开；不需要把折叠偏好写数据库或增加全局状态库。内容较多时侧栏独立纵向滚动，最后的分公司入口可达。

严格保留唯一选中逻辑：/boss仅精确匹配；其他详情路由匹配所属模块；直播与打粉用view=monetization区分，包含详情页面。未匹配的工作台路由给准确的当前位置，不误选工作台首页。

## 4. 顶部导航和返回

右侧顶部约56px高，sticky，不遮住内容。左侧唯一的“所在分组 / 当前模块”位置导航；右侧员工姓名、工作台切换与退出登录。

移除现有重复的“管理中心”顶部入口与内容区静态“管理中心 / 当前页面”文字。现有直播中控工作台/workbench入口放入明确的“切换工作台”菜单，保留目前可访问范围，不额外增加岗位入口或放宽权限。退出仍复用LogoutButton及现有服务端动作；真实姓名正常显示，不用示例员工冒充。

详情返回和历史来源是另一种语义：保留NavigationTrail及ReturnLink的逐级返回能力；可在内容区保留一行明确的“查看路径”，不要将它与顶部当前位置重复渲染。不要重写lib/navigation-trail.ts或改变via编码逻辑来解决样式问题。表单保存、筛选和分页仍保留原有来源。

先检查components/context-link.tsx、lib/navigation-trail.ts及所有ManagementShell调用方。共享管理布局变更会覆盖boss/accounts/account-config/resources/live-reports/leads/workbench中原本使用该组件的页面；保持各layout原有身份检查，不改变纯直播中控或导粉专员工作台。

## 5. 内容外框和窄屏

右侧min-width:0，浅灰页面底色，桌面内容间距约24px，窄屏约16px。移除目前包住所有children的大白卡片、额外边框和阴影，保留children需要的纵向间距。已有表格、表单、卡片保留自身样式，不一口气重做所有业务页面。

宽表格在自己的容器内滚动，页面整体不能被表格撑出横向滚动。检查表格页、详情页、表单页在外框变化后是否仍清晰；如确需局部样式修补，限定为外框引起的直接问题，列明文件与原因，不改业务。

<1024px使用左侧抽屉菜单，不再横向堆放全部菜单。顶部有可访问名称的打开按钮；抽屉支持关闭按钮、遮罩关闭、Esc、焦点限制和关闭后焦点返回，选择链接后自动关闭，打开时不滚动背景。优先用已有Radix能力，避免自制复杂焦点系统。桌面分组按钮须有aria-expanded，当前导航aria-current=page；键盘焦点可见。

不新增全局搜索、通知红点、分公司全局筛选、设置中心、主题切换或无功能占位按钮。

## 6. 验证（记录真实结果）

- npm run typecheck。
- 对实际修改的TS/TSX执行本地eslint；git diff --check。
- 本地构建：按开发规范配置隔离环境后npm run build，确认无真实生产凭证带入。构建失败先查原因，不升级依赖或修改业务规避。
- 使用隔离测试资料进行浏览器验收。已有scripts/test-phone-navigation.ts可提供导航夹具，先读脚本和开发规范，按TEST_DATABASE_URL、ALLOW_TEST_DESTRUCTION及HTTP环境要求运行，不照抄可能失效的/tmp脚本。结束清理夹具与临时服务。
- 本次不改业务服务，不要求无理由跑完整业务测试矩阵；如触碰导航或权限逻辑，补相应针对性验证，不写只镜像CSS实现的测试。

浏览器必验：
1. 1440×900、1366×768下菜单完整、层级明确、顶部不重叠；390×844窄屏无整页水平溢出，抽屉及键盘操作正常。
2. 16个菜单路由可达；当前项唯一选中，直播/打粉互切及详情高亮正确；折叠组后进入内部路由自动展开。
3. 账号列表、手机号列表、手机列表、一个详情和一个编辑表单布局正常，宽表格只在内部滚动。
4. 筛选后的手机号第2页→手机号详情→所在手机→关联抖音账号，再逐级返回；原筛选/page/pageSize保留。保存后来源路径保持。
5. 顶部切换与退出可用，不增加菜单权限；老板管理布局改版，纯直播中控和导粉专员仍使用原有工作空间。
6. 首页三个统计卡与快捷入口原样保留，没有新数据口径、模拟图表或新数据查询。

保存桌面、窄屏和主要交互截图作为审查证据，截图使用隔离数据，放Git忽略的临时目录，不提交。无法完成的检查写未验证及原因，不能宣称全部通过。

## 7. 交付

同轮更新docs/current-status.md、docs/CHANGELOG.md；如确有组件结构变动更新architecture.md。D043范围保持不变。状态写“已实现待Codex审查，未上线”，不要填写虚构生产备份或部署结果。

完成差异和敏感信息检查后按明确文件清单暂存、提交、推送feat/boss-layout-phase1并核对远程SHA。不要合并main或部署。最终报告：实际基准SHA、分支和提交SHA；修改文件与目的；实际测试命令/结果、浏览器截图位置；未验证项；是否存在临时进程/测试数据；确认未改首页数据、schema及正式环境。等待Codex独立审查。
