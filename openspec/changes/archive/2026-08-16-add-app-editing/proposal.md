## Why

应用添加后需要能修改配置（改名、改 URL、调整启动命令/超时/监测参数等）。当前 WebDeck 已实现编辑能力（工具栏 ✎ 打开编辑弹窗 → `apps:update` 全链路），但 openspec 基线（webdeck-core）只覆盖了"添加应用"与"配置持久化"，**编辑能力没有对应的规格记录**。本变更把已有编辑功能规格化为 `webdeck-core` 的增量，使该能力具备可校验、可演进的规格基线。

## What Changes

- 新增 `openspec/changes/add-app-editing/specs/webdeck-core/spec.md`，以 `## ADDED Requirements` 增量记录以下已实现能力：
  1. 编辑已有应用配置（弹窗预填、保存生效、持久化）
  2. 编辑时配置校验（与添加一致的校验规则，失败不保存）
  3. 编辑与进程/监测联动（保存后旧进程停止、监测按新配置重启）
- 新增 `proposal.md`（本文件）与 `tasks.md`
- 不修改源码、不修改已归档基线；范围为规格化已实现功能

## Impact

- **运行时行为**：无（功能已实现，本变更只补规格记录）
- **规格基线**：webdeck-core 获得"编辑应用"规格增量，后续编辑相关演进（如编辑图标、排序）可用 `## MODIFIED Requirements` 扩展
- **风险**：极低；tasks.md 中的源码核对任务保证规格与实现一致，避免规格漂移
