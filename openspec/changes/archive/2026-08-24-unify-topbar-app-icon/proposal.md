## Why

WebDeck 窗口左上角的品牌标识目前是一个 10×10 的渐变小色块（`.brand-dot`）+「WebDeck」文字，与任务栏 / Dock 上展示的应用图标（`assets/icon.png`，紫蓝渐变 WebDeck 徽标）视觉不一致——同一产品在两个位置的"脸"不同，品牌识别不统一。本次把左上角品牌标识替换为与任务栏一致的应用图标。

## What Changes

- **侧边栏头部品牌区**：`.brand-dot` 渐变小方块 → WebDeck 应用图标（与任务栏 / Dock 同设计）；「WebDeck」文字保留。
- **资源路径**：将 `assets/icon.png` 复制为 `src/renderer/icons/webdeck.png`（渲染层可加载路径，满足 CSP `img-src 'self'`；与内置应用图标 `icons/dsh.png` 同目录约定）。
- **样式适配**：品牌图标尺寸与圆角随主题微调，深/浅主题下均清晰可辨。
- **不动**：窗口/任务栏系统图标本身（本次不改发布图标）；其他品牌元素不动。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `webdeck-core`: 新增「侧边栏品牌标识使用应用图标」需求（ADDED，不改动既有需求）。

## Impact

- **受影响**：`src/renderer/index.html`、`src/renderer/styles.css`、新增 `src/renderer/icons/webdeck.png`；不涉及主进程 / preload / 打包配置。
- **无兼容性影响**：纯外壳视觉变化，不改变任何 API / 数据模型 / 对外行为。
