## Context

动机见 proposal.md，需求见 specs/webdeck-core delta。现状：渲染层 `clampSidebarWidth` 固定下限 180px；`endDrag` 松手统一 `applySidebarWidth(clientX)` 并落盘 `settings:setSidebarWidth`；收起走独立布尔状态 `sidebarCollapsed`（按钮/⌘\ → `settings:setSidebarCollapsed`），展开恢复持久化宽度；主进程 `ui:sidebar-width-preview` 与 `settings:setSidebarWidth` 同样钳制 180。e2e/smoke 已有完整拖拽设施（含真实鼠标路径的 setIgnoreMouseEvents 机制）。

## Goals / Non-Goals

**Goals**
- 拖拽左缘松手 → 收起，与按钮/⌘\ 收起完全等价（含持久化与展开恢复）。
- 不拖入阈值区时行为与现状逐像素一致（无回归）。

**Non-Goals**
- 不做拖动中实时收起（过阈值立即 display:none）——误触无缓冲，本期不做。
- 不做收起后拖拽展开（收起态分隔条隐藏，展开仍走按钮/⌘\）。

## Decisions

**D1: 收起判定 = 松手时释放点 < 80px（阈值常量），拖拽中不判定**
- 方案：`COLLAPSE_DRAG_THRESHOLD = 80`（渲染层常量，注释指向规格）；`endDrag` 中 `if (finalW < COLLAPSE_DRAG_THRESHOLD) → setSidebarCollapsed(true)`，否则现状路径（回弹 180 + 落盘）。
- 备选：实时判定（过阈值立即收起）——手感干脆但误触无缓冲；拖动中"过阈值再拖回"（阈值穿越判定）——复杂化且收益小。
- 理由：松手判定最稳；80px 远小于 180 下限，需明显拖到边缘才触发，与用户"拖进去收起来"的直觉动作匹配。

**D2: 拖拽模式放宽下限（0px 跟随），持久化路径保持 180 下限**
- 方案：`clampSidebarWidth(w, { allowCollapseZone })`——pointermove 用放宽版（min 0，让宽度/视图跟到阈值区）；`endDrag` 的落盘分支仍走 180 下限版；主进程 `ui:sidebar-width-preview` 同步放宽 min（视图跟随），`settings:setSidebarWidth` 保持 180 下限不变（存储永不出现窄宽度）。
- 备选：预览也钳 180（视图停在 180，DOM 继续缩小）——松手前出现 DOM/视图错位露底色；统一放宽（选择）。
- 理由：瞬态跟随无错位；存储路径双保险（主进程钳制 + 渲染层不落盘窄值）。

**D3: 收起时恢复渲染层宽度变量为上次合法值，不落盘窄宽度**
- 方案：拖拽过程中每次 `applySidebarWidth` 前记录 `lastValidWidth`（仅记录 ≥180 的值，或直接沿用进入阈值区前的宽度）；`endDrag` 判定收起时：`sidebarWidth = lastValidWidth`（CSS 变量先置回，避免展开瞬间宽度闪烁）、`applySidebarCollapsed(true)`、调用 `webdeck.setSidebarCollapsed(true)`，**不调用 setSidebarWidth**。
- 理由：满足规格"拖拽收起不污染宽度"场景；展开恢复自然复用持久化宽度。

**D4: 收起后的展开恢复零改动**
- 方案：复用既有机制——`applySidebarCollapsed`、浮动展开按钮、⌘\、`settings.sidebarCollapsed` 持久化均不动。
- 理由：拖拽收起只是给收起状态机新增一个入口，状态与恢复路径完全复用。

**D5: e2e/smoke 新用例**
- e2e 新增用例 C「拖拽收起」：拖到 30px 松手 → 断言 `body.sidebar-collapsed` 置位、`--sidebar-width` 不残留窄值（恢复为拖前宽度）、展开后宽度恢复；smoke 同步新增 RS 段断言（合成事件路径：down/move(30)/up → collapsed 标志 + settings.sidebarCollapsed + 宽度未污染）。
- 理由：交互行为自动化验证延续既有设施，覆盖新规格场景。

## Risks / Trade-offs

- [拖入阈值区松手误收] → 阈值 80px 需要明显拖到边缘；且与"拖到 150 回弹 180"的既有预期分界清晰；误收后展开按钮/⌘\ 一键恢复，损失可控。
- [主进程预览放宽后的瞬态（阈值区视图跟随）与收起瞬间的跳变] → 收起时视图由 `settings:setSidebarCollapsed` 重排为 x=0 全窗（既有路径），无新增跳变。
- [e2e 合成事件与真实鼠标差异] → 既有注入自愈机制（capture 等待、补发、合成兜底）沿用；真实鼠标路径由 smoke 合成事件 + 手动验收覆盖。
- [与 `moved` 守卫交互] → 纯点击（无 move）仍不触发任何变化，阈值判定只发生在真实拖动（moved=true）后，无冲突。

## Migration Plan

- 纯行为增量：不拖入阈值区则无感知变化；无数据迁移。
- 回滚：移除阈值判定分支与放宽的预览钳制即可，其余机制不变。

## Open Questions

无。
