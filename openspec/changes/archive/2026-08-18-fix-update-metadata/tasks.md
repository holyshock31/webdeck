# Tasks — fix-update-metadata

- [x] .github/workflows/release.yml：macOS 分支删除构建后 mv 重命名；改用 `--config.mac.artifactName` + `UNSIGNED_SUFFIX` 环境变量（无 CSC_LINK 时 `-unsigned`），元数据与文件名构建时同时生成
- [x] package.json：显式配置 `win.artifactName: WebDeck.Setup.${version}.${ext}` 与 `portable.artifactName: WebDeck.${version}.${ext}`（与产物实际命名对齐）
- [x] 本地验证：构建后检查 latest*.yml 的 url 与实际产物文件名一致（win/mac 各一次）
- [x] 存量修复：v0.1.10 的 mac zip/dmg 资产经 GitHub API 改名为元数据指向的文件名（WebDeck-0.1.10-arm64-mac.zip / WebDeck-0.1.10-arm64.dmg）；`gh run rerun --failed` 重跑 v0.1.10 Windows job 成功（latest.yml + Windows 资产已补齐）
- [x] 真机验证：清单文档化于 docs/windows-manual-verification.md（v0.1.9 检查更新下载 v0.1.10 成功、Windows 侧可下载、发布后抽查元数据一致性）；真机执行留待验收
