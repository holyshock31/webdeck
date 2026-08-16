## Why

WebDeck 的 MVP 功能已全部实现并通过测试（应用注册、本地服务启动/停止、健康监测状态机、配置持久化、多标签 UI、安全隔离），但 openspec 规格体系是在实现完成后才引入的，现有实现没有任何对应的规格记录。这导致规格驱动流程（`/spec approve → implement → verify → archive`）无法对已实现的功能做对照验收与追踪——"框架要求的 spec 记录"处于缺失状态。

本变更把当前项目已实现的内容**还原**为 OpenSpec 兼容的规格增量，使已交付能力具备可校验的规格基线。

## What Changes

- 新增 `openspec/changes/restore-implemented-specs/proposal.md`（本文件）
- 新增 `openspec/changes/restore-implemented-specs/tasks.md`（有序实现清单）
- 新增 `openspec/changes/restore-implemented-specs/specs/webdeck-core/spec.md`，以 `## ADDED Requirements` 增量记录以下已实现能力：
  1. 通过 URL 添加应用并配置启动方式（无 / 直接命令 / Shell 命令）
  2. 应用配置持久化（重启保留、settings 不丢失）
  3. 本地服务进程生命周期管理（进程组终止、日志环形缓冲）
  4. 健康监测状态机（stopped / starting / running / error）
  5. 多应用标签与登录态隔离（独立 session 分区）
  6. 远程内容安全隔离（sandbox + 权限白名单 + window.open 转系统浏览器）
  7. 运行状态可视化与操作（状态灯、工具栏、快捷键）

不修改任何源码、测试或构建配置；范围为纯文档恢复。

## Impact

- **运行时行为**：无。不触碰 `src/`、`scripts/`、`package.json`。
- **规格基线**：`webdeck-core` capability 获得第一份规格增量，后续功能变更可用 `## MODIFIED Requirements` 扩展，`/spec verify` 可对照验收。
- **风险**：极低。唯一注意点是规格内容必须与当前实现一致，避免"规格漂移"；tasks.md 中的核对任务保证这一点。
- **兼容性**：目录结构与 OpenSpec 格式兼容，`/spec validate` 应能通过。
