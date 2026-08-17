# AGENTS.md — Agent 行为约束（WebDeck 项目）

> 本文件约束所有 AI agent（及人类协作中的自动化部分）在本仓库中的行为。
> 项目使用 dsh-spec-loop 插件的 `/spec` 命令族驱动**规格 → 批准 → 实现 → 验收 → 归档**闭环。

## 核心规则：实现必须由 /spec 流程发起

**未经用户通过 `/spec implement <change-id>` 明确发起，禁止修改任何实现文件。** 包括但不限于：

- `src/**`（主进程、preload、渲染层）
- `scripts/**`（除 spec 流程要求的提案/任务文件外）
- `.github/**`（CI/Release 工作流）
- `package.json` / `package-lock.json`
- `README.md`、`docs/**`、`openspec/specs/**`（文档与规格同为仓库内容，同样受约束）

bug 修复、环境适配、打包发布等一切实现性改动，**一律先建变更再实施**：

1. 用户发起 `/spec new <目标>` → 生成 `openspec/changes/<id>/`（proposal / tasks / 规格增量）
2. `/spec approve <id>` 批准
3. `/spec implement <id>` 指令到达后，才能开始修改代码
4. `/spec verify <id>` 验收 → `/spec archive <id>` 归档

## 允许自主执行的动作（无需指令）

- **只读调查**：读文件、搜索、查看日志、`npm test`（运行现有测试）、`npm run smoke`（验证用）
- **流程文件写入**：`/spec new`、`/spec edit` 生成的提案文件（`openspec/changes/**`、`openspec/specs/**` 增量）；`verify.md` 由插件生成
- **诊断复现**：在临时分支/脚本中复现问题（如 CI 复现矩阵），但复现脚本不得作为正式修复落地，落地必须走 spec 流程
- **构建验证**：`electron-builder --dir` 等只读产物验证（产物在 `dist/`，已 gitignore）

## 边界情形

- **发现 bug 或平台差异**：先调查并报告证据 → 等用户决定是否 `/spec new` 建变更（或 `/spec edit` 并入在途变更）→ 批准后实施
- **用户口头要求直接修**：提示"这属于实现改动，建议走 /spec 流程"，用户坚持直接修时才可执行，并在回复中说明
- **发布/打 tag**：仅由用户指令发起；发布前确认对应变更已实现且验收

## 违反后果

未经 `/spec implement` 修改实现文件属于流程违规，用户有权要求回滚；agent 应在违规发生后立即停止并报告。
