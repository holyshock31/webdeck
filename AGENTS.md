# AGENTS.md — Agent 行为约束（WebDeck 项目）

> 本文件约束所有 AI agent（及人类协作中的自动化部分）在本仓库中的行为。
> 项目使用 openspec 技能族（`/openspec-*`）驱动**探索 → 提案 → 实施 → 同步 → 归档**闭环。

## 核心规则：实现必须由 /openspec 流程发起

**未经用户通过 `/openspec-apply-change <change-id>` 明确发起，禁止修改任何实现文件。** 包括但不限于：

- `src/**`（主进程、preload、渲染层）
- `scripts/**`（除 spec 流程要求的提案/任务文件外）
- `.github/**`（CI/Release 工作流）
- `package.json` / `package-lock.json`
- `README.md`、`docs/**`、`openspec/specs/**`（文档与规格同为仓库内容，同样受约束）

bug 修复、环境适配、打包发布等一切实现性改动，**一律先建变更再实施**：

1. 用户发起 `/openspec-propose <目标>`（可先 `/openspec-explore` 探索）→ 生成 `openspec/changes/<id>/`（proposal / design / specs / tasks）
2. 用户审阅变更工件（`openspec status` / `openspec view`）确认方案（即批准）
3. `/openspec-apply-change <id>` 指令到达后，才能开始修改代码，按 tasks.md 逐项实施并验证
4. 必要时 `/openspec-sync-specs` 同步规格增量 → `/openspec-archive-change <id>` 归档

## 允许自主执行的动作（无需指令）

- **只读调查**：读文件、搜索、查看日志、`npm test`（运行现有测试）、`npm run smoke`（验证用）
- **流程文件写入**：`/openspec-propose`、`/openspec-update-change` 生成的提案文件（`openspec/changes/**`、`openspec/specs/**` 增量）；归档前人工核验的 `verify.md` 验收记录
- **诊断复现**：在临时分支/脚本中复现问题（如 CI 复现矩阵），但复现脚本不得作为正式修复落地，落地必须走 spec 流程
- **构建验证**：`electron-builder --dir` 等只读产物验证（产物在 `dist/`，已 gitignore）

## 工程约定（实现时必须遵守）

- **运行时依赖分类**：被 `src/**` import 的外部包（如 electron-updater）必须放在 `package.json` 的 `dependencies`——electron-builder 只把生产依赖打进 asar，放 devDependencies 会导致打包产物 `ERR_MODULE_NOT_FOUND` 崩溃（v0.1.8 事故）；仅构建期工具（electron、electron-builder）留在 devDependencies

## 边界情形

- **发现 bug 或平台差异**：先调查并报告证据 → 等用户决定是否 `/openspec-propose` 建变更（或 `/openspec-update-change` 并入在途变更）→ 审阅后实施
- **用户口头要求直接修**：提示"这属于实现改动，建议走 /openspec 流程"，用户坚持直接修时才可执行，并在回复中说明
- **发布/打 tag**：仅由用户指令发起；发布前确认对应变更已实现且验收

## 违反后果

未经 `/openspec-apply-change` 修改实现文件属于流程违规，用户有权要求回滚；agent 应在违规发生后立即停止并报告。
