# Design — fix-publish-change

## Context

现状与动机见 `proposal.md — Why`。脚本 `initiate-change.sh`（原 `publish-change.sh`）的关键事实：

- worktree 从 `origin/main` 创建（`git worktree add .worktrees/<id> -b feat/<id> origin/main`），`.worktrees/` 已被 gitignore；
- 变更内容只在 worktree 内查找（L73），缺失即 `openspec new change` 生成骨架并退出；
- 暂存后无条件 `git commit`（L84），无改动即失败；
- 参数不校验格式，任意字符串都被当作 change-id。

需求契约见 `specs/initiate-change/spec.md`（输入契约 / 三级来源 / 跳过提交 / 可审计）。

## Goals / Non-Goals

**Goals**

- 修复坑 A（未推送变更被空骨架覆盖）与坑 B（已推送变更卡死 commit），使仓库中三个在途变更（`fix-mac-selfsigned-update`、`add-preset-feed`、`add-ui-hot-update`）都能被发布。
- 参数格式校验，避免把变更描述误当 change-id（本次误用即由此引发）。
- SKILL.md 与脚本行为对齐：明确输入契约与内容来源规则。

**Non-Goals**

- 不引入「重复发布检测」（同一 change 重复运行创建重复 Issue 的问题沿用现有 FAQ「分支已存在→删除后重跑」处理，不做自动化）。
- 不改变 Issue 元数据格式（`change_id` / `branch` / `branch_head_sha`）与 Bridge 契约。
- 不把 `.agents/` 纳入版本控制（用户另行决定，见 Open Questions）。

## Decisions

### D1: 变更内容来源——三级查找（worktree → 主 checkout → 骨架）

发布内容按序确定：

1. worktree 内 `openspec/changes/<id>` 存在且**非空骨架** → 直接使用（保留「worktree 内撰写后重跑」的既有流程）；
2. 否则主 checkout（`$REPO_ROOT/openspec/changes/<id>`）存在 → `cp -R` 复制进 worktree 后继续；
3. 两处都没有 → 生成骨架并退出（现有行为保留）。

**骨架判定**：目录内除 `.openspec.yaml` 外无任何文件（`find ... -mindepth 1 ! -name .openspec.yaml` 为空）即视为未撰写骨架。这样「worktree 里是上次运行生成的空骨架、主 checkout 里才是真内容」的并发场景下，工具会取真内容而不是发布空骨架。

**备选方案**：对未推送提交做 cherry-pick —— 无法覆盖未提交的撰写内容且依赖提交历史，复杂度过高；直接报错让用户手工复制 —— 违背工具"自动化发布"的定位。`cp -R` 简单、可覆盖已提交/未提交两种状态，且随后的 `openspec validate` 兜底校验内容完整性。

### D2: 无改动时跳过 commit

`git add -A` 后执行 `git diff --cached --quiet`：有改动才 commit；无改动（变更已在分支基线）则跳过并在输出中注明，直接 push + 建 Issue。`BRANCH_HEAD_SHA` 统一取 `git rev-parse HEAD`（提交后为新 SHA，跳过时为基线 SHA），保证 Issue 元数据始终为发布时刻真实 HEAD。

**备选方案**：`git commit --allow-empty` —— 会产生无意义提交，污染分支历史，拒绝。

### D3: 参数格式校验

进入任何流程前校验参数匹配 kebab-case（`^[a-z0-9]+(-[a-z0-9]+)*$`），不匹配则以用法错误退出，提示正确用法并指向 `/openspec-propose`。校验发生在 worktree 创建之前，保证非法输入零副作用。

### D4: SKILL.md 同步澄清

- 用法一节补充输入契约：参数必须是 change-id，不接受变更描述；描述性需求请走 `/openspec-propose`（或先 `/openspec-explore`）。
- 流程说明第 2 条改写为三级来源查找规则（含骨架判定）。
- 常见问题表新增两条：坑 A（变更只在本地 main）与坑 B（变更已在 origin/main）的触发场景与处理方式。

## Risks / Trade-offs

- [主 checkout 复制可能带入未提交的半成品内容] → 复制后 `openspec validate` 兜底，校验失败即中止并提示先完成撰写；不会把非法内容发布出去。
- [worktree 空骨架与主 checkout 真内容并存时误判] → D1 骨架判定以「仅含 .openspec.yaml」为准，覆盖正常流程；极端手工场景由 FAQ 兜底（删掉 worktree 骨架目录后重跑）。
- [同一 change 重复发布创建重复 Issue] → Non-Goal，沿用现有 FAQ（`git push origin --delete feat/<id>` 后重跑）；SKILL.md 已写明。
- [复制目录可能残留 git 元数据] → `openspec/changes/<id>` 内不包含 `.git`（git 不追踪嵌套仓库，且变更目录内无独立仓库），`cp -R` 安全。

## Migration Plan

无部署概念：脚本与文档原地修改即可生效。回滚 = git 还原这两个文件（若 `.agents/` 未纳入版本控制，则保留修改前的备份副本）。验证路径见 `tasks.md`：非法参数零副作用、坑 A/B 各用一个在途变更做真实发布验证（建 Issue 前与用户确认）。

## Open Questions

- `.agents/`（含本技能）是否随本次修复纳入版本控制？不影响方案与任务拆分，由用户在审阅时决定。
- 是否后续补「重复发布检测」（如远端分支已存在即中止）？默认 Non-Goal，用户可另立变更。
