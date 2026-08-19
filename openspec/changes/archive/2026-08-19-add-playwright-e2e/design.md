## Context

动机见 proposal.md - Why，需求见 specs/webdeck-e2e-testing。现状：`npm test` 纯逻辑单测；`npm run smoke` 是应用内自检（`--smoke` 进入 runSmokeTest，直接操作真实 userData，不隔离配置）；CI 的 Linux 任务已用 `xvfb-run -a npm run smoke -- --no-sandbox` 跑通无显示器冒烟（ci.yml 第 30-34 行先例）。项目为 ESM（`"type": "module"`）、无构建链，Electron 37 在 devDependencies。

## Goals / Non-Goals

**Goals**
- 最小可用标准 E2E 设施：一条命令、可断言、可进 CI，Agent 与人都能复用。
- 首个用例覆盖侧边栏宽度拖拽（宽度变化 + 钳制），与 add-resizable-sidebar 的验收场景对齐。

**Non-Goals**
- 不引入完整测试框架（@playwright/test 及其 runner/reporter）——用户明确指定 playwright-core + 自写 run.cjs。
- 不覆盖其他交互（查找栏、弹窗等）——设施可扩展，后续用例另行规划。
- 不改动主进程/渲染层任何行为（纯测试设施；如实现中发现必须的小改动，另行走 spec 变更）。

## Decisions

**D1: 依赖选型 `playwright-core`（devDependency），不用 `@playwright/test`**
- 方案：`playwright-core` 的 `_electron` API 内置 Electron 启动支持（`_electron.launch`），无需下载浏览器二进制；自写 `e2e/run.cjs` 用简单断言函数 + 计数/退出码约定，无框架负担。
- 备选：`@playwright/test`（自带 runner、expect、报告器——对单文件 E2E 过重）；自建 CDP 驱动（上次 resize-e2e.cjs 的教训：0×0 viewport、pointer capture、像素分析全在重造轮子）。
- 理由：用户明确指定；core 包体积小、与项目「无构建链」风格一致。

**D2: 启动方式——`_electron.launch` 以仓库根为 cwd 启动应用主入口**
- 方案：`const app = await _electron.launch({ args: ['.'], cwd: repoRoot, env: {...} })`——Electron 读取 package.json `main` 启动完整应用（非 smoke：不传 `--smoke`）；`executablePath` 走 playwright-core 默认解析（devDependencies 中的 electron）。
- 理由：完整应用路径与真实用户一致；smoke 模式会提前 exit，故必须走正常启动。

**D3: userData 隔离——`--user-data-dir` 重定向到临时目录 + 隔离自检**
- 方案：启动参数注入 `--user-data-dir=<mkdtemp>`（实测 Electron 37 下 `app.getPath('userData')` 随之重定向）；运行结束删除临时目录，并自检临时目录中确实生成了 webdeck.json（证明写入已重定向、真实配置未被触碰）。
- 备选：`HOME`/`APPDATA` 环境变量重定向（**实测 macOS 上 Electron 忽略 HOME，userData 仍指向真实路径——方案废弃**）；给主进程加 userData 覆盖开关（改动实现文件，超出本变更范围）。
- 理由：Chromium 开关三平台统一生效，零实现改动即获得确定性隔离；满足规格「不污染真实配置」。

**D4: 事件注入——CDP `Input.dispatchMouseEvent` 走真实输入管线**
- 方案：经 `app.firstWindow()` 获取页面 CDP session，派发 `mousePressed` / `mouseMoved` / `mouseReleased` 序列（button=left、buttons=1，按下点取分隔条中心，逐像素移动），触发应用的分隔条 pointer 事件链（含 setPointerCapture）。
- 备选：`page.mouse` API（Playwright 高层封装，同样走 CDP，可作首选；底层必要时直接用 Input.dispatchMouseEvent）；`element.dispatchEvent(new PointerEvent(...))`（纯合成事件，绕过输入管线，与真实拖拽行为不一致，不可接受）。
- 理由：CDP 注入是规格要求（不依赖真实鼠标/物理屏幕），且走真实事件管线，能覆盖 pointer capture 等真实交互路径。
- 实现提示：先用 `page.mouse`，若与 setPointerCapture 组合出现事件归属问题，降级/并行使用 CDP session 的 `Input.dispatchMouseEvent`（同一管线，可精确控制 buttons 状态）。

**D5: 断言方式——读 CSS 变量与 DOM 状态，不截图像素分析**
- 方案：`page.evaluate` 读取 `getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')`、`#sidebar` 实际宽度、`body.resizing` 类；钳制断言按 `min(180, ...)`/`max(180, window.innerWidth/2)` 计算期望值。
- 备选：截图 + 像素分析（上次教训：脆弱、慢、跨平台差异大）。
- 理由：行为断言直接对应规格场景（宽度实时变化、钳制边界、resizing 类置位/清除），稳定可读。

**D6: CI 集成——Linux 任务新增 e2e 步骤，沿用 smoke 的 xvfb-run 模式**
- 方案：ci.yml Linux 任务在 smoke 之后加 `run: xvfb-run -a npm run e2e -- --no-sandbox`（`--no-sandbox` 同 smoke 规避 runner 环境；xvfb-run 提供虚拟显示，满足「无需真实屏幕」场景）。
- 备选：三平台都跑 e2e（Windows/macOS 也支持，但超出用户指定范围，且增加 CI 时长）。
- 理由：用户明确「Linux + xvfb-run 标准组合」；与既有 smoke 步骤同构，零新基建。

## Risks / Trade-offs

- [playwright-core 与 Electron 37 兼容性（Chromium 版本匹配）] → 实现第一步即安装并跑通「启动→注入→断言」最小链路验证兼容性；如版本不匹配，升级/降级 playwright-core 至与 Electron 37 匹配的版本（devDependency 无运行时影响）。
- [CDP 注入与 setPointerCapture 交互异常（合成事件不被 capture 重定向）] → 断言失败时先区分「注入失效」与「应用行为错误」：注入失败输出事件序列日志；备选方案（page.mouse → Input.dispatchMouseEvent 精确 buttons 状态）已在 D4 预留。
- [CI 无头环境拖拽时序抖动（窗口未就绪/动画未完成）] → 统一等待窗口 `did-finish-load` + 固定 settle 延迟（参考 smoke 的 sleep 模式）；断言前显式等待 `#sidebar-resizer` 出现。
- [临时 userData 清理失败残留] → try/finally 保证清理；残留仅影响开发机磁盘，不影响真实配置（隔离目录）。

## Migration Plan

- 纯新增设施：npm install 新增 devDependency、新增 e2e/ 与 script、CI 加步骤；无数据迁移、无运行时行为变化。
- 回滚：移除 script、e2e/ 目录与 devDependency、CI 步骤回退，应用行为零影响。

## Open Questions

无。
