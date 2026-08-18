# Proposal — fix-release-draft

## Why

v0.1.10 事故复盘（源码对照 Cherry Studio 的 draft 发布机制，见 docs/research/cherry-studio-update-deep-dive.md）：

- 我们 release.yml 用 softprops 直接发布（无 draft）——三平台 job 独立完成、各自对外可见
- v0.1.10 的 Windows job 因 GitHub 基础设施故障失败，但 release 已发布可见 → 客户端按 latest-mac.yml 检测到 v0.1.10 → 下载 404
- Cherry 的发布侧：`ncipollo/release-action` + `draft: true` + `allowUpdates: true` + `makeLatest: false`——全部资产先进草稿，**人工在 GitHub UI 点 "Publish release" 才对外可见**；半成品版本永远不会被客户端自动发现（electron-updater 不读取 draft release 的元数据）

发布流程需要"全平台齐备 + 人工确认"的门禁，防同类事故复发。

## What Changes

- `.github/workflows/release.yml`：softprops/action-gh-release 增加 `draft: true` 与 `makeLatest: false`——三平台资产上传进草稿 release，不自动发布、不自动标记 Latest
- README「发布流程」更新：打 tag 后需到 GitHub Releases 页面**手动 Publish release**（确认三平台资产齐全后），未 Publish 前客户端不会检测到该版本
- 验证：打 tag 后 `gh release view <tag> --json draft` 确认 draft 状态；Publish 后客户端可检测

## Impact

- **发布流程**：多一步人工确认（Publish 按钮）——这是有意的门禁，成本一次点击，收益是杜绝半成品版本被客户端自动发现
- **客户端**：无运行时变化；electron-updater 只读取已发布 release 的元数据，draft 期间检查结果为无更新
- **兼容性**：存量 release 不受影响；后续发布按新流程
- **风险**：低——softprops 的 draft/makeLatest 参数为官方支持；需一次真实发布验证
- **范围边界**：不做发布审批自动化（人工 Publish 保持简单可靠）；验收方式为流程验证（打 tag → draft 可见 → Publish 后客户端检测）

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
