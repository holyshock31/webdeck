# Proposal — fix-drag-mouse-passthrough

## Why

`ui:sidebar-resizing` IPC 处理器（`src/main/index.js`）在分隔条拖动期间调用 `view.setIgnoreMouseEvents(...)`，让应用视图忽略鼠标、事件穿透到壳 UI，保证拖动连续。但 **Electron 37 的 `WebContentsView` 没有该方法**（仅存在于 BaseWindow/BrowserWindow/BrowserView）——每次拖动都会抛 `TypeError: view.setIgnoreMouseEvents is not a function`，该保护完全失效。

后果：应用视图（bounds 从侧边栏右缘开始覆盖内容区）会截获真实鼠标事件。拖动开始时指针在分隔条上（壳 UI），一旦向右移动进入应用视图区域，pointermove 被原生视图截走（指针捕获不跨 webContents），**真实鼠标拖动会中断**。e2e/smoke 用合成事件（直接 dispatch 到元素，绕过原生命中测试）所以测不出——这是真实交互缺陷。

## What Changes

- 删除穿透机制链路（实测 v0.1.15 无穿透机制时真实拖动正常，方案 A 隐藏视图导致内容区消失不可接受）：
  - `src/main/index.js`：删除 `ui:sidebar-resizing` IPC handler
  - `src/preload/preload.cjs`：删除 `setSidebarResizing` 桥
  - `src/renderer/app.js`：删除 pointerdown / endDrag 中的两处 `webdeck.setSidebarResizing(...)` 调用
- 拖动行为回到 v0.1.15 实证状态：分隔条拖动期间应用内容区持续可见、拖动连续、宽度实时跟随/钳制/收起判定不变

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无（纯实现修复：既有规格场景"拖动分隔条调整宽度"的行为不变，本变更使其在真实鼠标下成立；`skip_specs: true`）。

## Impact

- **代码**：`src/main/index.js`（删 handler）、`src/preload/preload.cjs`（删桥）、`src/renderer/app.js`（删两处调用），共约 10 行
- **行为**：拖动分隔条期间应用内容区持续可见（修复 v0.1.16 方案 A 的内容消失问题）；拖动连续性与 v0.1.15 一致
- **风险**：低——删除的是 v0.1.16 新增的穿透链路，回退即恢复；拖动语义（宽度跟随/钳制/收起）不受影响
- **验证**：`npm test`、`npm run smoke`（隔离 userData）、`npm run e2e` + 用户真机拖动确认
