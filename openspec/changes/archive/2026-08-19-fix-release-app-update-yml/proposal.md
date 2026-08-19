## Why

v0.1.15 起 macOS 客户端「检查更新」报 `ENOENT: no such file or directory, open '.../Contents/Resources/app-update.yml'`——electron-updater 在打包态读取 `Resources/app-update.yml` 解析更新源，文件缺失导致检查更新整体失败。证据链：v0.1.13/v0.1.14 产物含该文件（87B），v0.1.15 缺失；回归源是 fix-mac-unsigned-update 引入的 unsigned 构建流程（`--mac dir` → ad-hoc 签名 → `--prepackaged`）——electron-builder 仅在 targets 含 dmg/zip 时于 onAfterPack 写入 app-update.yml，`dir` 阶段跳过、`--prepackaged` 阶段未补写。

## What Changes

- `release.yml` unsigned 分支：在 `--mac dir` 构建并完成 ad-hoc 签名之后、`--prepackaged` 出包之前，**把 app-update.yml 写入已签名 .app 的 `Contents/Resources`**（内容与 electron-builder 直接构建生成一致：provider/owner/repo + updaterCacheDirName），保证最终 dmg/zip 内携带更新配置。
- **出包后断言**：unsigned 分支完成 dmg/zip 构建后，检查产物 zip 内存在 `app-update.yml`（缺失即 job 失败），防止流程再回归。
- 不改动：Windows/Linux 构建、签名逻辑、产物命名、draft release 流程。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `webdeck-packaging`: "发布物包含更新元数据"需求扩展——除 `latest*.yml` 外，macOS 更新 zip（含 unsigned 分支产物）内 MUST 携带 `app-update.yml`；发布流水线 MUST 断言产物含更新配置，缺失即构建失败。

## Impact

- `.github/workflows/release.yml`：macOS unsigned 分支增加 app-update.yml 注入步骤与产物断言步骤。
- 无运行时代码改动、无新依赖；修复后无需重新发布即可验证（下次打 tag 生效；如需立即修复线上 v0.1.15，可补发 v0.1.16）。
