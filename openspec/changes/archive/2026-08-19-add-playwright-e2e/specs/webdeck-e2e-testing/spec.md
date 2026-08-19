## Purpose

提供基于 Playwright 的标准 E2E 测试设施：一条命令启动完整 Electron 应用、注入真实输入事件并断言交互行为，供 Agent 与人工在本地和 CI 复用。

## ADDED Requirements

### Requirement: E2E 测试入口

项目提供 `npm run e2e` 命令（执行 `e2e/run.cjs`）：使用 playwright-core 启动完整 Electron 应用（非 smoke 模式），运行 E2E 用例后正常退出；全部用例通过时进程退出码 MUST 为 0，任一用例失败时退出码 MUST 非 0，且输出 MUST 包含失败用例名称与可定位的断言信息。E2E 运行 MUST 使用隔离的临时 userData 目录（运行结束清理），不得读写真实用户配置。

#### Scenario: 全部用例通过

用户在本地运行 `npm run e2e`，所有用例断言通过，命令以退出码 0 结束，输出显示通过的用例清单。

#### Scenario: 用例失败给出定位信息

某用例断言失败（如宽度钳制值不符），`npm run e2e` 以非 0 退出码结束，输出包含失败用例名称、期望值与实际值。

#### Scenario: 不污染真实配置

用户运行 `npm run e2e` 前后，真实 userData（webdeck.json 等）内容保持不变；临时目录在运行结束后被清理。

### Requirement: 侧边栏宽度调整 E2E 覆盖

E2E 用例 MUST 覆盖侧边栏宽度调整的交互行为，与 add-resizable-sidebar 的规格场景一致：经 CDP 注入鼠标拖拽事件（pointerdown/pointermove/pointerup 序列，不依赖真实鼠标与物理屏幕），断言拖拽过程中宽度实时变化、释放后保持，且宽度被钳制在 [180px, 窗口宽度一半] 范围内。

#### Scenario: 拖拽调整宽度

E2E 在侧边栏分隔条上注入按下→向右移动→释放的拖拽序列，断言拖拽过程中 `--sidebar-width` 随指针实时增大、释放后保持新宽度，且无文本选中（`body.resizing` 类在拖拽中置位、释放后清除）。

#### Scenario: 边界钳制

E2E 注入向左拖过 180px 的序列，断言宽度停在 180px；注入向右拖过窗口宽度一半的序列，断言宽度停在窗口宽度一半处。

#### Scenario: 无需真实鼠标与屏幕

E2E 在无头 CI（xvfb-run 虚拟显示）环境下运行通过，不依赖物理鼠标设备或真实屏幕分辨率。

### Requirement: CI 集成

CI（.github/workflows/ci.yml）Linux 任务 MUST 在 xvfb-run 下运行 `npm run e2e`，与 `npm test`、`npm run smoke` 并列；e2e 失败时 CI 标红。CI 运行 e2e 不得影响其他平台任务。

#### Scenario: CI 运行 e2e

Linux CI 任务依次运行 `npm test`、`npm run smoke`、`npm run e2e`（xvfb-run），全部通过则任务绿；e2e 任一失败则任务红。

#### Scenario: 平台任务互不影响

macOS / Windows CI 任务不运行 e2e 步骤，其自身测试通过与否与 Linux 的 e2e 结果无关。
