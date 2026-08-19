## Why

侧边栏宽度目前固定为 252px，无法适配不同内容的展示需求（如较长应用名、较大图标或用户偏好窄栏）。让用户通过拖动侧边栏右边界自由调整宽度，可显著改善多应用场景下的可用性。

## What Changes

- 在侧边栏右边界提供可拖动的分隔条（resize handle），支持左右拖动调整侧边栏宽度。
- 宽度受最小/最大边界约束（最小 180px，最大不超过窗口宽度的一半），避免拖到不可用或挤占主内容区。
- 拖动结束后宽度持久化到 settings（`settings.sidebarWidth`，随 webdeck.json 原子写入），重启后保持上次宽度；配置缺失或损坏时回退为默认 252px。
- 与现有收起/展开（⌘\）行为兼容：收起时侧边栏隐藏、无分隔条可拖；展开时以持久化宽度恢复。
- 拖动过程中内容区实时跟随，无闪烁；拖动时禁用文本选择，避免拖出选中态。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `webdeck-core`: 在"侧边栏支持收起与展开"需求之外新增"侧边栏宽度可调"需求，并扩展收起/展开需求的"展开时恢复原宽度"表述为"恢复持久化宽度"。

## Impact

- `src/renderer/index.html`：侧边栏结构新增分隔条元素。
- `src/renderer/styles.css`：分隔条样式、宽度由固定值改为变量驱动、拖动中/悬停光标样式。
- `src/renderer/app.js`：拖动事件处理（pointerdown/move/up）、宽度应用与边界钳制、settings.sidebarWidth 的读写与回退。
- 持久化：沿用现有 webdeck.json 原子写入通道（preload 白名单 API），无新依赖、无主进程改动。
