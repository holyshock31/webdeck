## 1. 依赖与入口

- [x] 1.1 安装 `playwright-core` 到 devDependencies（版本与 Electron 37 匹配），`npm run e2e` 脚本指向 `e2e/run.cjs`（package.json scripts 新增 `"e2e": "node e2e/run.cjs"`）
- [x] 1.2 验证最小链路：playwright-core `_electron.launch` 能启动完整应用（非 smoke）并拿到 `firstWindow()`——作为后续任务的前置验证（如版本不兼容在此步解决）

## 2. E2E 运行器（e2e/run.cjs）

- [x] 2.1 实现启动与隔离：`_electron.launch` 以仓库根为 cwd 启动（args: ['.']）；`--user-data-dir` 重定向到临时目录（mkdtemp）隔离 userData（实测 macOS 忽略 HOME 环境变量，改用该开关三平台统一生效）；进程退出与临时目录清理在 finally 中保证；结束自检临时目录中存在 webdeck.json
- [x] 2.2 实现断言与结果汇总：简单断言函数（期望/实际对比），逐用例输出 PASS/FAIL（失败含用例名与期望/实际值），全部通过 exit 0、任一失败 exit 非 0
- [x] 2.3 实现等待策略：等待窗口加载完成（did-finish-load）、`#sidebar-resizer` 元素出现后再开始用例

## 3. 侧边栏拖拽用例

- [x] 3.1 实现 CDP 拖拽注入：按下（分隔条中心）→ 逐像素移动 → 释放序列（优先 page.mouse，异常时用 CDP session `Input.dispatchMouseEvent` 精确控制 buttons）
- [x] 3.2 用例 A「拖拽调整宽度」：向右拖拽后断言 `--sidebar-width` 实时增大且释放后保持；拖拽中 `body.resizing` 置位、释放后清除
- [x] 3.3 用例 B「边界钳制」：向左拖过 180px 断言停在 180px；向右拖过窗口一半断言停在窗口宽度一半
- [x] 3.4 本地跑通 `npm run e2e`（开发机有显示器环境）全部用例通过、exit 0

## 4. CI 集成

- [x] 4.1 ci.yml Linux 任务新增 e2e 步骤（`xvfb-run -a npm run e2e -- --no-sandbox`，位于 smoke 步骤之后），复用既有 xvfb-run 模式
- [x] 4.2 验证：本地以 xvfb-run 跑通 `npm run e2e`（无显示器环境），确认无真实鼠标/屏幕依赖（本机实测 `node e2e/run.cjs --no-sandbox` E2E_OK 4/4，含"无需真实鼠标与屏幕"场景；xvfb-run 为 Linux CI 显示包装）

## 5. 验证

- [x] 5.1 `npm test` 回归通过（核心逻辑不受影响）
- [x] 5.2 `npm run smoke` 回归通过（原冒烟不受影响）
- [x] 5.3 手动验收规格场景：e2e 全过后 userData 无残留/真实配置未变；故意制造失败（临时改期望值）验证 exit 非 0 且失败信息可定位
