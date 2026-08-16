## Why

WebDeck 壳界面（侧边栏、弹窗、状态栏）目前是固定暗色主题（#14161c 深色系），没有切换选项。用户长期在浅色环境工作，暗色侧边栏不习惯，需要提供主题切换能力。当前样式集中在 `src/renderer/styles.css`，颜色值硬编码分散在各规则中，直接增加浅色主题会导致两套样式重复维护，因此需要先做样式变量化（design tokens）再扩展主题。

## What Changes

- 新增 `webdeck-theming` capability 规格增量（本变更的 `specs/webdeck-theming/spec.md`）
- 将 `src/renderer/styles.css` 的硬编码颜色抽为 CSS 变量（如 `--bg-sidebar`、`--bg-content`、`--text-primary`、`--dot-running` 等），定义 `dark`（现状）与 `light` 两套取值
- 侧边栏工具栏（或底部状态栏区域）增加主题切换入口，点击在 dark / light 间切换，切换立即生效
- 主题选择持久化到现有 settings（`webdeck.json` 的 `settings.theme`，复用 `store.updateSettings` 机制），重启后保持
- 状态灯四色（绿/黄/红/灰）在 light 主题下提供对比度足够的对应值

不修改远程内嵌页面（各自独立 session/视图，主题只作用于 WebDeck 自身 UI）；不触碰进程管理、健康监测、持久化之外的逻辑。

## Impact

- **运行时行为**：仅渲染层样式与设置持久化；主进程、本地进程、监测逻辑不变
- **兼容性**：`settings.theme` 为新增可选字段，缺失时回退 `dark`，旧配置文件无需迁移
- **风险**：样式变量化涉及全部现有 UI 规则，有回归风险（颜色错位、对比度不足），验收方式为手动验证两套主题下的侧边栏、弹窗、状态灯可辨识性
- **范围边界**：不提供主题编辑器/自定义色板、不跟随系统外观（后续可扩展）
