## Why

应用列表（侧边栏）目前每个应用只显示首字母色块（avatar），无法区分不同应用。用户希望应用支持图标设置——例如嵌入的 DeepSeek Harness 应用显示 DeepSeek 鲸鱼图标，列表可快速辨认。DSH 图标素材已入库（`assets/icons/dsh.png` 等），本变更把"应用图标设置与显示"规格化为 `webdeck-core` 的新增能力。

## What Changes

- 新增 `openspec/changes/add-app-icons/specs/webdeck-core/spec.md`，以 `## ADDED Requirements` 增量记录：
  1. 应用配置支持 `icon` 字段（图标来源：内置图标/本地路径/URL）
  2. 侧边栏列表渲染图标，未设置或加载失败时回退首字母色块
  3. 图标配置随应用持久化，重启保持
- 内置图标素材已就绪：`assets/icons/dsh.png`（225px 主素材）、`dsh-64.png`、`dsh-128.png`（DeepSeek 官方鲸鱼 logo，透明背景）
- 新增 `proposal.md`（本文件）与 `tasks.md`

## Impact

- **运行时行为**：仅渲染层与配置字段扩展；`icon` 为可选字段，缺失时行为与现状完全一致（首字母色块），旧配置无需迁移
- **兼容性**：`normalizeApp` 增加可选 `icon` 字段，不改变现有字段语义；远程页面、进程、监测逻辑不变
- **风险**：低；图标加载失败需有回退路径（避免破图影响列表）；验收方式为手动验证
- **范围边界**：本次仅支持静态图标（内置/路径/URL），不支持运行时自动抓取站点 favicon（可后续扩展）
