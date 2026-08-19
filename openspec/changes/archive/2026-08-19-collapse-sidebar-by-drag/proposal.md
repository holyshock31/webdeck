## Why

侧边栏的拖拽调宽与收起/展开是两套互不相通的状态机：拖拽在 180px 下限处死死停住，永远无法通过拖拽到达收起态；收起只能点按钮或 ⌘\。用户拖拽边界向左到边缘的直觉动作（"拖进去收起来"）目前得不到响应。

## What Changes

- 拖拽分隔条向左越过收起阈值（释放点距窗口左缘 < 80px）后松手 → 侧边栏进入收起态（与按钮/⌘\ 收起等效：`settings.sidebarCollapsed=true` 持久化、主内容区占满窗口、展开按钮出现）。
- 拖动中允许宽度跟随指针低于 180px（进入"收起阈值区"），主进程视图预览同步跟随（放宽预览钳制，仅瞬态）；松手时判定：
  - 释放点 < 80px → 收起（**不落盘 sub-180 宽度**，保留上次合法宽度，展开时恢复）
  - 释放点 ≥ 80px → 回弹钳制到 180px 并正常落盘（现状行为）
- 收起后：分隔条隐藏、浮动展开按钮（▶）与 ⌘\ 恢复展开并回到持久化宽度（既有机制，无需新做）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `webdeck-core`: "侧边栏支持收起与展开"新增拖拽收起场景；"侧边栏宽度可调"补充 180px 下限下方的拖拽阈值区语义与回弹/收起判定。

## Impact

- `src/renderer/app.js`：`clampSidebarWidth` 增加拖拽模式（下限放开至收起阈值区）；`endDrag` 增加释放点判定分支（< 80px → `setSidebarCollapsed(true)`，不落盘宽度；否则回弹 180 落盘）。
- `src/main/index.js`：`ui:sidebar-width-preview` 放宽下限（视图跟随拖拽到阈值区）；`settings:setSidebarWidth` 持久化路径保持 180 下限不变。
- e2e（e2e/run.cjs）与 smoke（src/main/index.js 冒烟段）新增用例：拖到 30px → 收起态 + 宽度未污染 + 展开恢复。
- 无新依赖、无运行时行为回归（不拖到阈值区则行为与现状完全一致）。
