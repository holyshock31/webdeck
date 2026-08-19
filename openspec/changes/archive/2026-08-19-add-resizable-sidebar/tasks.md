## 1. 设置持久化通道

- [x] 1.1 主进程 settings 模块增加 `sidebarWidth` 字段读写：新增 `settings:setSidebarWidth` IPC 处理，沿用现有 settings 原子写入路径（webdeck.json 临时文件 + rename），getSettings 返回该字段
- [x] 1.2 preload 白名单 API 增加 `setSidebarWidth(width)`，与现有 `setSidebarCollapsed` 同构

## 2. 渲染层：宽度变量与分隔条

- [x] 2.1 `src/renderer/styles.css`：`#sidebar` 宽度改为 `var(--sidebar-width, 252px)`；新增 `#sidebar-resizer` 样式（约 6px 宽、`cursor: col-resize`、hover 高亮）；`body.resizing` 规则（全局 `cursor: col-resize`、`user-select: none`）
- [x] 2.2 `src/renderer/index.html`：在 `#sidebar` 与主内容区之间插入 `<div id="sidebar-resizer">` 分隔条元素
- [x] 2.3 `src/renderer/app.js`：启动时读取 `settings.sidebarWidth` 并应用为 `--sidebar-width`，缺失或非数值时回退 252px（与现有 `applySidebarCollapsed` 同模式）

## 3. 拖动交互

- [x] 3.1 `src/renderer/app.js`：实现分隔条拖动逻辑——`pointerdown` 时 `setPointerCapture` 并给 body 加 `resizing` 类；`pointermove` 实时计算新宽度并钳制在 [180px, max(180px, 窗口宽度/2)] 后写入 CSS 变量；`pointerup`/`pointercancel` 移除 `resizing` 类并释放捕获
- [x] 3.2 拖动结束（pointerup）时调用 `webdeck.setSidebarWidth(最终宽度)` 落盘；落盘值与 CSS 变量值一致（已钳制）
- [x] 3.3 收起态联动：`body.sidebar-collapsed` 规则同时隐藏 `#sidebar-resizer`（随侧边栏一起 `display: none`），展开后恢复显示，且宽度沿用持久化值

## 4. 验证

- [x] 4.1 运行 `npm test` 确认核心逻辑回归通过
- [x] 4.2 运行 `npm run smoke` 确认全链路冒烟通过
- [x] 4.3 手动验收：拖动分隔条宽度实时变化且不出现文本选中；拖到窗口一半以上/180px 以下被钳制；重启后宽度保持；收起→展开宽度不被重置；收起态无分隔条
