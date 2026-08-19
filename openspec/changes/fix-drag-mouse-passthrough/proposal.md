# Proposal — fix-drag-mouse-passthrough

## Why

`ui:sidebar-resizing` IPC 处理器（`src/main/index.js`）在分隔条拖动期间调用 `view.setIgnoreMouseEvents(...)`，让应用视图忽略鼠标、事件穿透到壳 UI，保证拖动连续。但 **Electron 37 的 `WebContentsView` 没有该方法**（仅存在于 BaseWindow/BrowserWindow/BrowserView）——每次拖动都会抛 `TypeError: view.setIgnoreMouseEvents is not a function`，该保护完全失效。

后果：应用视图（bounds 从侧边栏右缘开始覆盖内容区）会截获真实鼠标事件。拖动开始时指针在分隔条上（壳 UI），一旦向右移动进入应用视图区域，pointermove 被原生视图截走（指针捕获不跨 webContents），**真实鼠标拖动会中断**。e2e/smoke 用合成事件（直接 dispatch 到元素，绕过原生命中测试）所以测不出——这是真实交互缺陷。

## What Changes

- `ui:sidebar-resizing` 处理器：拖动期间把激活应用视图 `setVisible(false)`（隐藏后无命中区，鼠标事件穿透到壳 UI，拖动连续），拖动结束 `setVisible(true)` 恢复显示
- 移除对不存在 API 的调用（消除 TypeError）
- 不改变：拖动语义（宽度实时跟随/钳制/收起判定）、视图内容（隐藏仅瞬态，webContents 不销毁，恢复后状态保留）、其他 IPC 路径

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无（纯实现修复：既有规格场景"拖动分隔条调整宽度"的行为不变，本变更使其在真实鼠标下成立；`skip_specs: true`）。

## Impact

- **代码**：`src/main/index.js` 的 `ui:sidebar-resizing` handler（一处，约 2 行）
- **行为**：拖动期间应用内容瞬态隐藏（与拖动开始时壳 UI 覆盖侧边栏区域的现状相比，代价是拖动过程内容不可见）；拖动结束恢复，页面状态（表单、滚动）保留
- **风险**：低——恢复路径与 `pointercancel` 一致（渲染层 endDrag 的 cancel 分支同样调用 `setSidebarResizing(false)`）；modal 打开路径不受影响（拖动与弹窗互斥）
- **验证**：`npm test`、`npm run smoke`（隔离 userData）、`npm run e2e`
