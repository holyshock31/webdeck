# Design — fix-activate-no-reload

## Context

`activateApp()`（`src/main/index.js` L316）是侧边栏点击、应用菜单、⌘1–⌘9、启动恢复、冒烟测试共用的唯一激活入口。当前实现中 `view.webContents.loadURL(appCfg.url)`（L335）位于所有条件分支之外，每次激活都对已存在视图发起完整导航（详见 proposal.md — Why）。相关现状约束：

- `createView()`（L98）**不**加载 URL——首次加载完全依赖 L335
- `apps:update`（L475）不重载视图——「编辑 URL 后激活即生效」今天恰好由无条件 loadURL 顺带实现，修复后必须显式保留
- 渲染层无改动面：侧边栏点击只走 `activate()` → `apps:activate`，无独立 reload 路径；显式重载入口为工具栏 ↻（`app:reload`）与 ⌘R
- 冒烟测试（L630-668 等）与 e2e 均对新建应用做首次激活、或不做激活断言，不依赖「激活即重载」语义

## Goals / Non-Goals

**Goals:**
- 任何侧边栏点击（切换、重复点击当前应用）都不触发页面重载
- 首次激活、配置 URL 变更、加载失败/崩溃后的激活仍会加载/重载
- 零渲染层改动；不动会话分区、查找栏、状态监测

**Non-Goals:**
- 不做 SPA 路由级"回首页"能力（彻底移除该语义，非改为轻量导航）
- 不改 `app:reload` / ⌘R 显式重载入口
- 不做视图懒加载/销毁策略调整（视图仍常驻 `views` Map，仅切换可见性）

## Decisions

**D1：视图记录"已加载 URL"，加载仅在三类情形触发。**
在 `createView()` 创建后挂载 `__loadedUrl` 状态；`activateApp()` 中：

```
needLoad = isNew                       // 首次创建
        || view.__loadedUrl !== appCfg.url   // 配置 URL 变更（编辑生效）
        || view.__loadFailed           // 上次加载失败/崩溃（自愈重试）
```

仅 `needLoad` 时执行 `loadURL(appCfg.url)` 并置 `__loadedUrl = appCfg.url`；其余激活只做视图切换/聚焦。
- 备选：用 `webContents.getURL()` 与配置 URL 比较——被否：重定向、SPA history、错误页都会使实际 URL ≠ 配置 URL，产生误判重载
- 备选：彻底只在首次创建加载（连 URL 变更也不管）——被否：编辑 URL 后需手动 ⌘R 才生效，是现状行为回归

**D2：失败/崩溃标志由既有事件处理器维护，实现自愈重试。**
`did-fail-load`（非 ABORTED，L125）与 `render-process-gone`（L129）处理器中置 `view.__loadFailed = true`；`did-finish-load` 时清除。下次激活即触发 D1 的第三分支重新加载。
- 理由：现状下每次点击都会隐式重试失败页；一刀切移除后，短暂网络抖动会把用户困在错误页（只有 ⌘R 可救）。该分支只对"上一次加载未成功"的视图生效，不构成对正常页面的点击刷新
- 备选：不保留自愈，依赖 ⌘R——被否：错误页场景 UX 退化

**D3：加载尝试与标志写回时机。**
`__loadedUrl` 在发起 `loadURL` 时写入（尝试语义）；`__loadFailed` 由事件回调维护。两者互不覆盖：即使某次尝试失败（`__loadedUrl` 已写入），`__loadFailed` 仍为 true，保证下次激活重试。
- 不引入新的 IPC 或持久化状态：两标志均为视图实例上的运行时字段，重启后视图重建（isNew 分支兜底）

**D4：主进程单点修改，渲染层/冒烟零改动。**
所有入口（侧边栏、菜单、快捷键、启动恢复）最终都汇入 `activateApp`，修复只需改这一处及其事件处理器；`--smoke`/`--smoke-dsh` 首次激活路径不变（isNew → load，`did-finish-load` 照常触发）。

## Risks / Trade-offs

- [URL 变更后用户未激活不生效（运行中的旧视图继续显示旧页面）] → 与现状一致（现状也只在激活时加载）；激活即加载新 URL 已保留
- [视图长期驻留导致内存占用（页面状态保留的代价）] → 与现状一致，非本变更引入；本次刻意保留页面状态正是目标
- [`__loadedUrl` 与 `__loadFailed` 标志若与视图生命周期不同步（removeApp 已销毁视图，无泄漏路径）] → 标志挂在视图实例上，随 `views` Map 删除自然回收（`apps:remove` L489-495 已销毁视图）
- [行为变更被既有规格场景断言"重复点击回首页"挡住] → 本变更同时修改 delta spec（见 specs/webdeck-core），归档时覆盖旧要求

## Migration Plan

纯运行时行为变更，无数据/配置迁移。回滚 = 撤销本变更提交，恢复无条件 `loadURL`（spec 需一并回退）。

## Open Questions

无。
