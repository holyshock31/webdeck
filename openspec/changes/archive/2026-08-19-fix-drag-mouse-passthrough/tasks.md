# Tasks — fix-drag-mouse-passthrough

## 1. 删除穿透机制（方案 B：实测 v0.1.15 无穿透机制时真实拖动正常）

- [x] 1.1 `src/main/index.js`：删除 `ui:sidebar-resizing` IPC handler（含注释）
- [x] 1.2 `src/preload/preload.cjs`：删除 `setSidebarResizing` 桥
- [x] 1.3 `src/renderer/app.js`：删除 pointerdown 与 endDrag 中的两处 `webdeck.setSidebarResizing(...)` 调用（含注释）

## 2. 验证

- [x] 2.1 `npm test` 通过（核心逻辑回归）
- [x] 2.2 `npm run smoke` 通过（隔离 userData：SMOKE_OK；拖动用例回归且无 TypeError）
- [x] 2.3 `npm run e2e` 通过（E2E_OK，拖拽用例回归）
- [x] 2.4 `openspec validate --change fix-drag-mouse-passthrough` 通过
- [x] 2.5 用户真机拖动确认：拖动分隔条期间应用内容区持续可见、拖动连续不中断
