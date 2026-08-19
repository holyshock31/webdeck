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

**D1：删除穿透机制（方案 B，替代原方案 A）。**
实测证据驱动：v0.1.15（无任何穿透机制：无 `ui:sidebar-resizing` handler、无 setIgnoreMouseEvents）发布后用户长期正常使用拖拽调宽，未出现拖动中断；v0.1.16 采用方案 A（拖动期间 `view.setVisible(false)`）后拖动连续但**应用内容区在拖动期间消失**，用户体验不可接受。结论：真实鼠标拖动不需要穿透机制（Electron 命中行为与理论推断不符，以实证为准），删除整个穿透链路（主进程 handler、preload 桥、渲染层两处调用），行为回到 v0.1.15 实证状态。
- 备选 A（已试，被否决）：拖动期间隐藏应用视图——内容区消失，用户实测不满
- 备选 C：升级 Electron 用 `before-mouse-event`——PR #47280 只提供"阻止页面收到鼠标事件"，事件仍被视图截走，不解决穿透；且需升级运行时
- 若方案 B 实测仍出现拖动中断（用户真机验证后反馈），再评估视图左缘跟随指针等替代方案

**D2：删除范围。**
三处：主进程 `ui:sidebar-resizing` handler（含注释）、preload 桥 `setSidebarResizing`、渲染层 pointerdown/endDrag 两处 `webdeck.setSidebarResizing(...)` 调用。endDrag 的 pointercancel 恢复路径随调用一并移除（无穿透机制则无恢复需求）。modal 打开路径（`view.setVisible(!modalOpen)`）不受影响。

## Risks / Trade-offs

- [方案 B 依赖"真实拖动不需要穿透"的实证（v0.1.15 用户长期使用正常）] → 若真机验证出现中断，回退到视图左缘跟随指针等方案；本变更删除的代码在 git 历史中可完整恢复
- [删除 handler 后，若未来引入需要穿透的场景（如重叠视图交互）] → 重新评估时以实测为准，不再基于架构推断引入

## Migration Plan

无数据/配置迁移；回滚 = 恢复 v0.1.16 的 handler/桥/调用（git 历史可查）。

## Open Questions

无。
