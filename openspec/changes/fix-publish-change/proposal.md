## Why

`initiate-change` 技能（`.agents/skills/initiate-change/`，原 `publish-change`）的定位是**发布一个已撰写完成的 OpenSpec change**（worktree → validate → commit → push → 建 GitLab Issue），但脚本有两个行为缺陷，导致它实际发布不了仓库中真实存在的在途变更，与技能定位不符：

- **坑 A（未推送的变更被忽略）**：worktree 从 `origin/main` 创建，脚本只在 worktree 内查找 `openspec/changes/<id>`。变更若只存在于本地 main（未推送），worktree 里找不到 → 脚本生成一个**空骨架**并退出，用户在主 checkout 已撰写的内容被静默忽略。
- **坑 B（已推送的变更卡死在 commit）**：变更若已推送到 `origin/main`，worktree 拉下来时它已是已提交状态 → 第 3 步 `git commit` 报 "nothing to commit" 直接失败，无法继续 push 和建 Issue。

实测：当前仓库 `fix-mac-selfsigned-update` 只存在于本地 main（命中坑 A），`add-preset-feed` / `add-ui-hot-update` 已在 origin/main（命中坑 B）——**三个在途变更按现状一个都发不出去**。此外 SKILL.md 未明确输入契约（参数必须是 change-id，不接受变更描述），容易把「创建变更」（/openspec-propose）与「发布变更」混为一谈。

## What Changes

- **`initiate-change.sh` 坑 A 修复**：worktree 内无该 change 时，先检查主 checkout 的 `openspec/changes/<id>`；存在则将其复制进 worktree 后继续发布流程（validate → commit → push → Issue），不生成空骨架；两处都不存在时才生成骨架并退出（保留「先在 worktree 撰写」的既有入口）。
- **`initiate-change.sh` 坑 B 修复**：暂存后无任何改动（变更已包含在分支基线中）时跳过 commit，直接推送分支并创建 Issue；有改动时行为不变。`branch_head_sha` 以实际 HEAD（基线 SHA）为准。
- **SKILL.md 澄清**：用法一节明确输入契约——参数必须是已存在（或将要撰写）的 change-id，不接受变更描述；变更描述请走 `/openspec-propose`。流程说明与常见问题表补充坑 A/B 的触发场景与处理方式。

## Capabilities

### New Capabilities

- `initiate-change`: 发起变更工具 `initiate-change` 的行为契约——worktree 内容来源（worktree / 主 checkout / 骨架兜底三级查找）、无改动跳过 commit、以及输入契约（仅接受 change-id）。

### Modified Capabilities

- 无。现有 specs（webdeck-core / webdeck-packaging / webdeck-theming / webdeck-e2e-testing）均描述 WebDeck 产品行为，本变更只影响开发工具，不改动任何产品行为。

## Impact

- **受影响文件**：`.agents/skills/initiate-change/initiate-change.sh`、`.agents/skills/initiate-change/SKILL.md`。
- **备注**：`.agents/` 目前未被 gitignore、也未被提交（`?? .agents/skills/initiate-change/`），技能文件尚未纳入版本控制；是否随本变更一并提交由用户在 apply 审阅时决定，不影响工具行为本身。
- **无运行时影响**：不涉及 `src/**`、`package.json`、CI、发布产物；不改变已发布变更的「冻结 SHA」语义（分支 head SHA 仍为发布时刻值）。
- **依赖**：无新增依赖。
