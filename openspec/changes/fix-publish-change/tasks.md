## 1. 准备

- [x] 1.1 修改前备份 `.agents/skills/initiate-change/initiate-change.sh` 与 `SKILL.md` 到 `.tmp-publish-change-backup/`（`.tmp-*/` 已被 gitignore，不进入版本库，用于回滚）

## 2. 输入契约与参数校验（D3）

- [x] 2.1 在 `initiate-change.sh` 参数解析后加入 kebab-case 校验（`^[a-z0-9]+(-[a-z0-9]+)*$`）：不匹配即以用法错误退出（非 0 退出码），提示正确用法并指向 `/openspec-propose`；校验必须先于任何 worktree 创建 / git fetch / 网络操作
- [x] 2.2 验证：传入「左上角的图标换成任务栏一样的图标」等含空格/非 kebab-case 参数 → 立即报错退出；`git worktree list` 无新增目录、`openspec/changes/` 无新增文件

## 3. 坑 A：变更内容来源三级查找（D1）

- [x] 3.1 worktree 内无 `openspec/changes/<id>` 时，先检查主 checkout（`$REPO_ROOT/openspec/changes/<id>`）：存在则 `cp -R` 复制进 worktree 并继续发布流程（validate → 提交 → push → Issue），不生成空骨架
- [x] 3.2 骨架判定：worktree 内该目录除 `.openspec.yaml` 外无任何文件（`find ... -mindepth 1 ! -name .openspec.yaml` 为空）即视为未撰写骨架，回落主 checkout 查找；两处都没有才 `openspec new change` 生成骨架并退出（现有行为保留）
- [x] 3.3 演练验证（不推送、不建 Issue）：对仅在本地 main 的 `fix-mac-selfsigned-update` 运行脚本至 push 前一步，确认 worktree 内是完整已撰写内容而非空骨架，然后清理演练 worktree 与分支

## 4. 坑 B：无改动时跳过提交（D2）

- [x] 4.1 在 `git add -A -- openspec/changes/<id>` 后加 `git diff --cached --quiet` 判断：无改动则跳过 `git commit` 并在输出中注明「变更已包含在分支基线，跳过提交」；`BRANCH_HEAD_SHA` 统一取 `git rev-parse HEAD`；有改动时行为不变
- [x] 4.2 演练验证（不推送、不建 Issue）：对已在 origin/main 的 `add-preset-feed` 运行脚本至 push 前一步，确认不再以 "nothing to commit" 失败、能走到 push 步骤，然后清理演练 worktree 与分支

## 5. SKILL.md 同步（D4）

- [x] 5.1 用法一节补充输入契约：参数必须是 change-id（kebab-case），不接受变更描述；描述性需求请走 `/openspec-propose`（可先 `/openspec-explore`）
- [x] 5.2 流程说明第 2 条改写为三级来源查找规则（worktree → 主 checkout → 骨架兜底），含骨架判定说明
- [x] 5.3 常见问题表新增两行：坑 A（变更只在本地 main，未推送）与坑 B（变更已在 origin/main）的触发场景与处理方式
- [x] 5.4 对照 `specs/initiate-change/spec.md` 逐条核对 SKILL.md 与脚本行为一致（输入契约 / 三级来源 / 跳过提交 / 可审计）

## 6. 收尾

- [x] 6.1 按用户审阅时的决定处理 `.agents/` 版本控制（默认：不纳入版本控制，保持现状）
- [ ] 6.2 （可选，经用户确认后）真实发布一个在途变更（push + 建 Issue）验证全链路，确认 Issue 元数据 `change_id` / `branch` / `branch_head_sha` 正确
