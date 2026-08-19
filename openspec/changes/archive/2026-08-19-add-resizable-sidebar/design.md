## Context

侧边栏当前为固定 `width: 252px`（`src/renderer/styles.css` 中 `#sidebar`），收起/展开由 `body.sidebar-collapsed` 控制，状态持久化于 `settings.sidebarCollapsed`。渲染层通过 preload 白名单 API 读写设置（现有 `settings:setSidebarCollapsed` 通道与 `webdeck.json` 原子写入机制可直接复用）。项目约定：渲染层为原生 JS、无框架，样式集中在 styles.css，主进程模块保持纯 Node 可单测。动机见 proposal.md - Why。

## Goals / Non-Goals

**Goals**
- 用最贴近现有架构的方式实现可拖动宽度调整：纯渲染层实现，不新增依赖、不改主进程。
- 宽度边界（180px 下限、窗口一半上限）与持久化（settings.sidebarWidth）与现有收起/展开机制正交、互不干扰。

**Non-Goals**
- 不做左右两侧双栏（左侧栏固定、仅右边界可拖）。
- 不做拖动过程中的节流/虚拟化——应用列表内容简单，直接重排即可。
- 不改变收起/展开的既有入口与快捷键。

## Decisions

**D1: 分隔条使用独立元素 + Pointer Events，而非 CSS `resize` 或边框拖动**
- 方案：在 `#sidebar` 与主内容区之间插入一个约 6px 宽的分隔条元素（`#sidebar-resizer`），监听 `pointerdown` → `pointermove`/`pointerup`，拖动时实时计算新宽度并写入 `#sidebar` 的 style.width。
- 备选：CSS `resize: horizontal`（无法与 flex 布局中 `flex: none` 的宽度语义平滑配合、视觉与交互不可控，且无法自定义边界钳制）；纯边框拖动（命中区域太窄、无 hover 反馈）。
- 理由：Pointer Events 天然覆盖鼠标与触控板；独立元素可精确控制命中区宽度、cursor 与 hover 态，且与现有「分隔条在收起态隐藏」的需求直接对应。

**D2: 拖动期间使用 `setPointerCapture`，并在拖动开始时给 `body` 加 `resizing` 类**
- 方案：`pointerdown` 时 `resizer.setPointerCapture(e.pointerId)`，后续 move/up 都收在该元素上，避免移出窗口边缘丢失事件；拖动中 `body.resizing` 使 `user-select: none` 且光标全局为 `col-resize`，松开后移除。
- 理由：`setPointerCapture` 是处理跨元素拖动的标准手段，无需 window 级监听与清理逻辑；`user-select: none` 满足规格中「拖动时禁止文本选中」。

**D3: 宽度用变量驱动（`--sidebar-width`），钳制后落盘**
- 方案：`#sidebar { width: var(--sidebar-width, 252px); }`；拖动结束（pointerup）时把最终宽度写入 `webdeck.setSidebarWidth(w)`，启动时经 `getSettings()` 读取并回退 252px。
- 备选：直接写死 style.width 字符串（可行，但变量让收起/展开切换与主题统一走 CSS 层，减少 JS 字符串拼接）。
- 理由：变量驱动与现有 `body.sidebar-collapsed` 的 CSS 切换方式同构，最小化对现有布局逻辑的扰动。

**D4: 最大宽度按「窗口宽度的一半」钳制**
- 方案：`max = Math.max(180, Math.round(window.innerWidth / 2))`，`min = 180`，拖动中与落盘前都做钳制（拖动中钳制保证视觉即时受限）。
- 理由：保证主内容区始终可用；窗口 resize 后不主动重算已存宽度（用户下次拖动时自然受限），避免复杂联动。
- 备选：按窗口比例百分比持久化（引入换算与舍入误差，收益小）。

**D5: 持久化沿用现有 settings 通道，新增 `settings:setSidebarWidth`**
- 方案：preload 增加 `setSidebarWidth` 白名单 API，主进程沿用现有 settings 写路径（`settings.sidebarWidth`，原子写入 webdeck.json）；缺失/损坏时渲染层回退 252px。
- 理由：与 `settings.sidebarCollapsed` 完全同构，主进程无新逻辑、无新依赖，符合「UI 经 preload contextBridge 白名单 API 通信」的既有约定。

## Risks / Trade-offs

- [拖动过程中窗口被 resize（如进入全屏）导致宽度超出新窗口一半] → 仅在下次拖动时钳制生效，不做实时监听；影响仅为视觉上可能短暂偏宽，可接受。
- [快速拖动时布局重排抖动] → 内容为轻量 DOM（应用列表 + 分隔条），无重绘瓶颈；如出现可后续加 rAF 节流，不在本次范围。
- [与现有收起/展开逻辑的交互回归] → 收起态下分隔条随 `#sidebar` 一起 `display: none`（同规则），展开恢复；落盘宽度与 collapsed 状态互不读写，规格中的「收起展开不改变宽度」场景即覆盖此风险。

## Migration Plan

- 纯前端增量改动：启动时 `getSettings()` 无 `sidebarWidth` 字段即回退 252px，与旧版本配置天然兼容，无数据迁移。
- 回滚：删除分隔条元素与相关 JS/CSS 即可回到固定宽度行为，不影响已写入的 settings 字段。

## Open Questions

无。
