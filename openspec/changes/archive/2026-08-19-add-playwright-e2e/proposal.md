## Why

webdeck 缺少 UI 自动化测试设施：`npm test` 只覆盖核心逻辑、`npm run smoke` 是应用内自检，交互行为（如侧边栏拖拽）只能人工验收。上次实现中 Agent 自建 Electron 拖拽驱动（resize-e2e.cjs），大量时间耗在测试基础设施（0×0 viewport、pointer capture、截图像素分析），且代码不可复用。引入 Playwright 标准设施，让 Agent 与人都复用同一套 E2E 入口。

## What Changes

- 新增 devDependency `playwright-core`（Electron 支持内置于 core，无需下载浏览器）。
- 新增 E2E 入口 `npm run e2e`（`e2e/run.cjs`）：Playwright 启动完整 Electron 应用，经 CDP 注入鼠标拖拽事件（不操作真实鼠标、不依赖物理屏幕），断言交互行为；全部通过 exit 0，任一失败 exit 非 0 并输出可定位的失败信息。
- 首个覆盖用例：侧边栏宽度调整（与 add-resizable-sidebar 验收互补）——拖动分隔条宽度实时变化、边界钳制（下限 180px、上限窗口宽度一半）。
- E2E 运行使用隔离的临时 userData，不触碰真实用户配置；测试设施可扩展（后续用例沿用同一入口）。
- CI（`.github/workflows/ci.yml`）Linux 任务在 `xvfb-run` 下新增 e2e 步骤，失败标红，与 `npm test` / `npm run smoke` 并列。

## Capabilities

### New Capabilities

- `webdeck-e2e-testing`: E2E 测试设施能力——`npm run e2e` 入口、Playwright 驱动 Electron、CDP 事件注入、侧边栏宽度拖拽与钳制断言、CI 集成。

### Modified Capabilities

（无）

## Impact

- `package.json`：devDependencies 新增 `playwright-core`；scripts 新增 `e2e`。
- `e2e/run.cjs`：新增 Playwright E2E 脚本（启动、注入、断言、退出码）。
- `.github/workflows/ci.yml`：Linux 任务新增 e2e 步骤（xvfb-run）。
- 运行时无影响：不新增运行时依赖、不改主进程/渲染层行为（仅测试设施）。
