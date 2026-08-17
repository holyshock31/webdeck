# Tasks — fix-release-draft

- [x] .github/workflows/release.yml：softprops/action-gh-release 增加 `draft: true` 与 `makeLatest: false`（三平台资产进草稿，人工 Publish 才可见）
- [x] README.md 发布流程更新：打 tag 后确认资产齐全 → GitHub Releases 页面手动 Publish release（未 Publish 前客户端不检测）
- [x] 流程验证：打 tag 触发发布 → `gh release view <tag> --json draft` 确认 draft=true、Latest 未被标记；Publish 后客户端可检测到新版本
- [x] 回归：npm test 与 npm run smoke 全绿
