# Tasks — fix-drag-mouse-passthrough

## 1. 主进程：拖动期间鼠标穿透

- [x] 1.1 `ui:sidebar-resizing` handler（src/main/index.js）：移除 `view.setIgnoreMouseEvents(...)` 调用，改为拖动期间 `view.setVisible(!active)`（active=true 隐藏视图使事件穿透，active=false 恢复显示）；保留判空与返回结构
- [x] 1.2 核对恢复路径：渲染层 endDrag 的 pointerup / pointercancel 均调用 `setSidebarResizing(false)`（现有代码，无需改动），确认取消拖动也会恢复视图可见

## 2. 验证

- [x] 2.1 `npm test` 通过（核心逻辑回归）
- [x] 2.2 `npm run smoke` 通过（隔离 userData：SMOKE_OK，且 `ui:sidebar-resizing` 不再报 TypeError）
- [x] 2.3 `npm run e2e` 通过（E2E_OK，拖拽用例回归）
- [ ] 2.4 `openspec validate --change fix-drag-mouse-passthrough` 通过（skip_specs 声明）
