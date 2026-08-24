# Design — unify-topbar-app-icon

## Context

现状：`src/renderer/styles.css` 的 `.brand-dot`（10×10、`linear-gradient(135deg, var(--accent), var(--brand-grad-end))`）是左上角品牌标识；`src/renderer/index.html` 侧边栏头部 `.brand` 内为色块 + 「WebDeck」文字。任务栏 / Dock 图标为 `assets/icon.png`（1024×1024 紫蓝渐变 WebDeck 徽标，白底圆角）。

需求契约见 `specs/webdeck-core/spec.md`（新增需求：品牌标识使用应用图标）。

## Goals / Non-Goals

**Goals**

- 左上角品牌标识 = 任务栏 / Dock 同款应用图标（单个 `<img>` 替换色块）。
- 资源放入渲染层可加载路径，满足 CSP `img-src 'self'`。
- 深浅主题下均清晰。

**Non-Goals**

- 不改任务栏 / Dock / 发布图标本身；不改窗口图标；不改其他品牌元素。

## Decisions

### D1: 资源复制进 renderer（不做跨目录引用）

`cp assets/icon.png src/renderer/icons/webdeck.png`，`index.html` 中 `<img src="icons/webdeck.png">`（相对路径与 `icons/dsh.png` 内置应用图标同一约定）。**备选**：`<img src="../../assets/icon.png">`——渲染层以 `loadFile('../renderer/index.html')` 加载，跨目录相对路径在 file:// 下不可靠且不利于 future UI 热更新包（`add-ui-hot-update` 语义：renderer 文件独立版本化），拒绝。

### D2: 样式

`.brand-icon`：约 22px 见方、圆角 5px（贴近应用图标自身圆角）、`object-fit: contain`；两主题共用（图标自带白底，深浅背景均可辨）；删除 `.brand-dot` 规则。空隙与既有 `.brand` gap 保持一致。

## Risks / Trade-offs

- [资源体积] → assets/icon.png 约 1.3MB，渲染层多一份副本 → 可用 `sips` 降采样到 128px（约几十 KB）后放入；视觉不变。
- [无功能风险] → 纯视觉改动，`npm run smoke` 验证全链路不回归。

## Migration Plan

无部署概念；改动后 `npm run smoke` 验证。回滚 = 还原 index.html / styles.css 并删除新增图标文件。

## Open Questions

- 无。
