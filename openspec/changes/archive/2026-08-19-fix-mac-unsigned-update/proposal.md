# fix-mac-unsigned-update

## Why

macOS 版（v0.1.13）用户点击"立即安装"升级到 v0.1.14 时**界面无任何反应**。日志（`~/Library/Application Support/WebDeck/logs/webdeck.log`）显示：Squirrel.Mac 安装前做代码签名校验，报 `Code signature at URL .../WebDeck.app/ did not pass validation: code has no resources but signature indicates they must be present`，安装被中止；而渲染层只在"手动检查"场景才提示错误，自动更新流程里失败完全静默。根因是发布流水线的 unsigned 分支产物（`WebDeck-*-mac-unsigned.zip`）内 app 的 ad-hoc 签名不完整（仅 linker-signed CodeDirectory、`Sealed Resources=none`，`codesign --verify` 直接失败），Squirrel.Mac 拒绝安装。

## What Changes

- **发布流水线 unsigned 分支改为"先 ad-hoc 签名再打包"**：`release.yml` 无证书分支由直接 `electron-builder --mac` 改为 `--mac dir` 构建 → 对 .app 执行 `codesign --force --deep --sign -`（完整 ad-hoc 签名，密封资源）→ `--prepackaged` 生成 dmg/zip/latest-mac.yml。产物命名不变（仍带 `-unsigned` 后缀，避免改动既有命名约定与元数据一致性要求）。已实测：重签后 `codesign --verify --deep --strict` 通过（`Sealed Resources version=2`）。
- **安装失败可见 + 下载页兜底**：下载完成后的安装阶段失败（签名校验、环境异常等）时，界面展示失败原因，并提供"打开下载页"（GitHub Releases）兜底；不再静默无反馈。错误不再局限于"手动检查才提示"。
- **规格修正**：现有 `webdeck-core`「更新安装的平台分派」要求 macOS（未签名）不做自动安装、只给下载页——与实现漂移（实际给了"立即安装"）。本次明确：unsigned 产物经 ad-hoc 签名后 macOS 同样可自动安装；安装失败时回退下载页。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `webdeck-core`：更新安装的平台分派与错误提示行为变化——macOS unsigned（ad-hoc 签名后）可自动安装；安装失败时界面可见并引导打开下载页。
- `webdeck-packaging`：发布产物签名要求变化——无证书分支产物须经完整 ad-hoc 签名，更新 zip 内 app 通过 `codesign --verify`，可被 Squirrel.Mac 接受。

## Impact

- `.github/workflows/release.yml`：macOS unsigned 分支构建流程（`--mac dir` → ad-hoc 签名 → `--prepackaged` 出包），artifactName 等命名保持不变。
- `src/renderer/app.js`：`updater:error` 处理放宽——下载完成/安装阶段失败时展示错误与"打开下载页"按钮，不限于手动检查。
- `src/main/updater.js`：安装失败错误事件的广播与"打开下载页"IPC 复用（`updater:open-download` 已存在）；`quitAndInstall` 失败路径的错误捕获与上报。
- 文档：`README.md` 发布流程与 FAQ 中 macOS 更新说明同步（unsigned 产物可自动更新；失败回退下载页）。
- 不影响：Windows/Linux 构建、portable 行为、更新检查调度。
