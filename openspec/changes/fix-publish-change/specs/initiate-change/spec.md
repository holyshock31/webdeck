## Purpose

定义发起变更工具 `initiate-change` 的行为契约：把已撰写的 OpenSpec change 从独立 worktree 发布为 GitLab Issue（触发 Bridge 建卡），正确处理变更内容来源（worktree / 主 checkout / 骨架兜底）与无改动场景。

## ADDED Requirements

### Requirement: 发布仅接受 change-id 参数

工具 SHALL 接受且仅接受一个位置参数，并将其视为 OpenSpec change-id（kebab-case，如 `add-preset-feed`）。工具 SHALL NOT 从自由文本描述推断或创建变更；描述性输入（如「把左上角图标换成任务栏图标」）超出本工具契约，应走 `/openspec-propose`。参数不符合 kebab-case 格式时，工具 SHALL 以用法错误退出，并在错误信息中提示正确的用法与 `/openspec-propose` 入口。

#### Scenario: 传入合法 change-id

- **WHEN** 调用者以合法 kebab-case change-id 调用工具
- **THEN** 工具继续执行发布流程

#### Scenario: 传入非法参数（描述文本）

- **WHEN** 调用者传入包含空格/非 kebab-case 字符的描述文本作为参数
- **THEN** 工具以用法错误退出，不创建 worktree、不触碰任何变更目录，并提示应使用 change-id 或走 `/openspec-propose`

#### Scenario: 合法 change-id 但变更尚不存在

- **WHEN** 调用者传入格式合法但尚未撰写的 change-id（worktree 与主 checkout 中均不存在）
- **THEN** 工具生成变更骨架并退出，不执行发布；撰写完成后重新运行才继续

### Requirement: 变更内容来源三级查找

发布时工具 SHALL 按以下顺序确定变更内容来源：① worktree 内 `openspec/changes/<id>` 存在则直接使用；② 否则检查主 checkout 的 `openspec/changes/<id>`，存在则复制进 worktree 后继续；③ 两处均不存在才生成骨架并退出。任何来源的变更内容在发布前 SHALL 通过 `openspec validate` 校验。

#### Scenario: 变更只在主 checkout（未推送）

- **WHEN** 变更已撰写并提交在本地 main、但未推送到 origin/main，且 worktree 内不存在
- **THEN** 工具将主 checkout 的完整变更目录复制进 worktree，校验通过后按正常流程发布，不生成空骨架

#### Scenario: 变更已在 worktree 内

- **WHEN** 上次运行已生成骨架、调用者已在 worktree 内撰写完成并重新运行
- **THEN** 工具直接使用 worktree 内内容继续发布

#### Scenario: 变更已在 origin/main 上

- **WHEN** 变更内容已存在于远端 main（worktree 拉取时即包含）
- **THEN** 工具仍能完成发布（见「无改动时跳过提交」），不因无差异而失败

### Requirement: 无改动时跳过提交

暂存变更目录后若无任何改动（变更已包含在分支基线中），工具 SHALL 跳过 commit 步骤并继续 push 分支与创建 Issue，不得以 "nothing to commit" 失败终止。`branch_head_sha` SHALL 取实际 HEAD（分支基线 SHA）。

#### Scenario: 变更已包含在分支基线

- **WHEN** worktree 内变更目录与基线无差异，暂存后无改动
- **THEN** 工具跳过 commit，推送分支并创建 Issue，Issue 描述中的 `branch_head_sha` 为基线 HEAD

#### Scenario: 变更目录有新增/修改

- **WHEN** worktree 内变更目录存在未提交的撰写内容
- **THEN** 工具先提交再推送，`branch_head_sha` 为新提交 SHA

### Requirement: 发布动作可审计

工具 SHALL 将变更发布为 `feat/<change-id>` 分支（基于远端 main）并推送，同时创建 GitLab Issue：标签为 `change`，描述 SHALL 包含 `change_id`、`branch`、`branch_head_sha` 三行元数据，以便 Bridge 建卡与追溯。

#### Scenario: 发布成功

- **WHEN** 校验、提交（或跳过）、推送均成功
- **THEN** 工具创建带元数据的 GitLab Issue，并输出分支名、head SHA 与 Issue 编号

#### Scenario: 发布后继续修改

- **WHEN** 发布完成后调用者在 worktree 内继续修改变更并重新运行
- **THEN** 工具复用已有 worktree，将新改动追加提交并推送；已建卡的冻结 SHA 不受影响
