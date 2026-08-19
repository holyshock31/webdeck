# Design — fix-drag-mouse-passthrough

## Context

`ui:sidebar-resizing`（`src/main/index.js`，拖动开始/结束各调一次）的意图：拖动期间让应用视图忽略鼠标，使指针移出分隔条后事件仍到达壳 UI（指针捕获不跨 webContents，见渲染层 initSidebarResizer 注释）。当前实现调用 `view.setIgnoreMouseEvents(...)`，但 Electron 37 的 `WebContentsView` 无此 API（d.ts 确认：`setIgnoreMouseEvents` 仅存在于 BaseWindow/BrowserWindow/BrowserView），handler 每次拖动抛 TypeError，功能失效。e2e/smoke 的合成事件绕过原生命中测试，无法暴露该缺陷。

## Goals / Non-Goals

**Goals:**
- 拖动期间鼠标事件穿透到壳 UI（真实鼠标拖动连续不中断）
- 消除 TypeError
- 拖动结束视图恢复显示，页面状态保留

**Non-Goals:**
- 不改变拖动语义（宽度跟随/钳制/收起判定）
- 不升级 Electron（v38 的 `before-mouse-event` 只能阻止页面收事件，不能把事件转给壳 UI，不解决穿透）
- 不做窗口级 `setIgnoreMouseEvents`（会连壳 UI 一起忽略，适得其反）

## Decisions

**D1：拖动期间隐藏应用视图（`view.setVisible(false)`），结束恢复。**
隐藏的视图无命中区，鼠标事件自然穿透到壳 UI；webContents 不销毁，恢复显示后页面状态（表单、滚动、SPA 状态）保留。
- 备选 A：删除该调用——若"真实拖动被视图截走"的架构推断成立则功能残废；且该调用当初被显式加入必有原因（注释自述），不推荐
- 备选 B：拖动期间把视图 bounds 移出窗口/缩到 0 宽——等价于隐藏但更绕，且依赖布局时序
- 备选 C：升级 Electron 用 `before-mouse-event`——PR #47280 只提供"阻止页面收到鼠标事件"，事件仍被视图截走，不会转发到壳 UI；不解决命中穿透

**D2：恢复时机与既有路径一致。**
渲染层 endDrag 的 pointerup 与 pointercancel 分支都会调用 `setSidebarResizing(false)`（现有代码），因此恢复显示覆盖取消路径，无需改动渲染层。modal 打开路径（`view.setVisible(!modalOpen)`）与拖动互斥（拖动期间不会开弹窗），无冲突。

**D3：handler 内保留防御性判空。**
`views.get(activeId)` 可能为 null（未激活任何应用时拖动——实际分隔条拖动要求侧边栏展开且有激活视图；保留判空不改变行为）。

## Risks / Trade-offs

- [拖动期间应用内容瞬态隐藏（显示窗口背景）] → 拖动是 1-2 秒瞬态手势，对比"拖动中断"体验更优；结束即恢复
- [`setVisible(false)` 对 webContents 的影响（页面可见性事件）] → 页面会收到 visibilitychange（hidden），恢复后变回 visible；第三方页面按标准行为处理，可接受
- [若真实鼠标拖动在现行代码下实际不卡（推断未被实测证实）] → 隐藏方案仍保证拖动连续，无回归；代价仅为拖动期间内容隐藏

## Migration Plan

无数据/配置迁移；回滚 = 撤销本变更（恢复 `setIgnoreMouseEvents` 调用）。

## Open Questions

无。
