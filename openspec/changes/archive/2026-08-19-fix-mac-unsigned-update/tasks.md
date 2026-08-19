# fix-mac-unsigned-update — Tasks

## 1. 发布流水线：unsigned 分支产出可被 Squirrel.Mac 接受的 mac 包

- [x] 1.1 修改 `.github/workflows/release.yml` 的 "Build macOS (unsigned, no notarization)" 步骤：先 `npx electron-builder --mac dir --publish never` 构建 `dist/mac-arm64/WebDeck.app`（不直接出 zip）
- [x] 1.2 在 dir 构建后新增 ad-hoc 签名步骤：`codesign --force --deep --sign - dist/mac-arm64/WebDeck.app`（完整签名、密封资源）
- [x] 1.3 新增出包步骤：`npx electron-builder --mac --prepackaged dist/mac-arm64/WebDeck.app --publish never`，artifactName 保持 `WebDeck-${version}-${arch}-mac${env.UNSIGNED_SUFFIX}.${ext}`（`-unsigned` 后缀与元数据一致性约定不变），产出 dmg + zip + latest-mac.yml
- [x] 1.4 出包后新增签名校验断言步骤：`codesign --verify --deep --strict dist/mac-arm64/WebDeck.app`，失败即 job 失败（防止坏签名包进入 release）
- [x] 1.5 本机复现验证流程：`electron-builder --mac dir` → ad-hoc 签名 → `codesign --verify --deep --strict` 通过 → `--prepackaged` 出 zip，确认 zip 内 app 签名保持完整（解压后再次 verify）

## 2. 主进程：安装失败错误上报

- [x] 2.1 `src/main/updater.js` 的 `quitAndInstall()` 包 try/catch：异常记录日志并经 `broadcast('error', ...)` 上报（与既有 error 事件路径幂等共存）
- [x] 2.2 确认 macOS 安装失败路径可达 error 上报（Squirrel.Mac 校验失败 → nativeUpdater error → 既有 `on('error')` 广播），不遗漏

## 3. 渲染层：安装失败可见 + 下载页兜底

- [x] 3.1 `src/renderer/app.js`：`updState` 增加安装失败字段；`case 'error'` 放宽——`updState.downloaded === true`（已下载待安装）时展示错误消息，弹窗/提示条提供「打开下载页」按钮（复用 `webdeck.openDownloadPage`），不再静默
- [x] 3.2 手动检查场景保留原 alert 行为；安装失败后「立即安装」仍可重试
- [x] 3.3 错误态清除：后续 `available` / `downloaded` / `cancelled` 事件到来时清除陈旧错误（重试或新检查后不残留旧报错）

## 4. 文档同步

- [x] 4.1 `README.md`：发布流程与 FAQ 的 macOS 更新说明同步——unsigned 产物（`-unsigned` 后缀，实际已 ad-hoc 签名）可自动更新；安装失败时界面提示并回退「打开下载页」；后缀语义说明（仅表示未用 Developer ID 签名）

## 5. 回归与验收

- [x] 5.1 运行 `npm test` 与 `npm run smoke` 全量回归（更新链路改动不破坏现有功能）
- [x] 5.2 `openspec validate` 通过（变更规格增量合法）
- [x] 5.3 验收记录：发布期在 mac 上走一次真实更新（新版本包 → 立即安装 → 自动重启进入新版）；若未到发布期，以 1.5 的签名校验 + 单元回归作为阶段性验收，真实链路留待首次发布验证

### 验收记录（阶段性）

- **签名链路（1.5 复现）**：`electron-builder --mac dir` → `codesign --force --deep --sign -` → `codesign --verify --deep --strict` 通过 → `--prepackaged` 出 `WebDeck-0.1.14-arm64-mac-unsigned.zip` → 解压后 zip 内 app 再次 verify 通过（`Sealed Resources version=2`）；`latest-mac.yml` url/sha512 与实际资产一致（`-unsigned` 命名约定保持）。对比修复前 v0.1.14 坏包：`Sealed Resources=none`、verify 失败（Squirrel.Mac 拒绝安装，即本次事故根因）。
- **单测**：`npm test` 全部通过（含更新调度/加固/本地化纯函数 11/11b/11c）。
- **smoke**：本机运行除两项**环境性**断言外全部通过——①`stored=undefined`：DSH 文件沙箱禁止 Electron 子进程写 `~/Library/Application Support/WebDeck/webdeck.json.tmp`（`EPERM`，与 dmg 构建缓存 EPERM 同因）；②`SMOKE_UI ui=false`：dev smoke 与正在运行的生产 WebDeck 共享同一 userData（macOS 大小写不敏感路径），侧边栏已含生产应用、无空态。两项均不涉及本次更新链路改动，CI（三平台、无沙箱、干净 userData）为权威回归门禁。
- **待发布期验收**：修复后流水线产出的首个 mac 版本（v0.1.15+）发布后，在 mac 上走一次真实「立即安装 → 自动重启」链路。
