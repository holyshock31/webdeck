# Proposal — fix-update-metadata

## Why

v0.1.9 安装版（macOS）检查更新发现 v0.1.10 后下载报 404：

```
Cannot download ".../v0.1.10/WebDeck-0.1.10-arm64-mac.zip", status 404
```

根因（已核对 Releases 资产与元数据）：**更新元数据（latest*.yml）与实际资产文件名不一致**——`release.yml` 的 macOS 分支在 electron-builder 构建**之后**用 `mv` 重命名资产（未签名加 `-unsigned` 后缀），而 `latest-mac.yml` 是构建**时**生成的（url 用重命名前的文件名）→ 客户端按元数据下载必然 404。Windows 侧同样存在：v0.1.9 的 `latest.yml` url 为 `WebDeck-Setup-0.1.9.exe`（连字符），实际资产为 `WebDeck.Setup.0.1.9.exe`（点号）——Windows 自动更新同样会 404。

另：v0.1.10 的 Windows 构建 job 因 GitHub 基础设施瞬时故障（下载 action 503/429）失败，导致该版本缺 Windows 资产。

## What Changes

- `.github/workflows/release.yml` macOS 分支：**删除构建后 `mv` 重命名**；改为构建时经 `--config.mac.artifactName` 注入后缀——未签名构建（无 `CSC_LINK`）时设 `UNSIGNED_SUFFIX=-unsigned` 环境变量，artifactName 模板 `${env.UNSIGNED_SUFFIX}` 使**元数据与文件名在构建时同时生成、天然一致**
- `package.json` build 配置：显式配置 `win.artifactName`（`WebDeck.Setup.${version}.${ext}`）与 `portable.artifactName`（`WebDeck.${version}.${ext}`）——与 electron-builder 实际产物命名对齐，消除 latest.yml 的 url 漂移
- 验证：本地 `electron-builder --dir`/`--win` 检查元数据 url 与产物文件名一致；CI 发布后核对 latest*.yml 与实际资产
- 存量修复（发布后执行）：把 v0.1.10 的 mac zip/dmg 资产改名为元数据指向的文件名（GitHub API），使已安装 v0.1.9 的客户端立即恢复更新；重跑 v0.1.10 Windows job 补 Windows 资产

## Impact

- **发布侧**：资产命名规则变化（未签名 mac 产物保留 `-unsigned` 后缀但由构建时注入而非重命名）；元数据与资产名从此一致，自动更新可下载
- **运行时**：无代码变化；客户端更新检查/下载行为不变
- **兼容性**：存量 release（v0.1.0–v0.1.9）元数据与资产不一致的历史问题不追溯（仅修复存量 v0.1.10 资产），新版本起一致
- **风险**：低——artifactName 插值为 electron-builder 标准能力；需 CI 真实验证一次发布
- **范围边界**：不做版本回滚机制、不做自建分发；验收方式为手动验证（客户端检查更新 → 下载成功）

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
