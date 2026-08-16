# Proposal — add-packaging-release

## Why

WebDeck 目前只能以开发态运行（`npm start` / `electron .`），没有任何可分发产物：

- 用户拿到项目只能 clone 源码自己跑，没有安装包、没有官方下载渠道；README 路线图里的「electron-builder 打包（dmg/zip）」与「Windows 适配（打包脚本）」尚未落地；
- 没有发布流水线：构建、产物托管、版本发布全靠手动，无法支撑跨平台分发；
- macOS 产物未签名未公证：即使打出发包，Gatekeeper 也会拦截首次打开，无法正常交付给他人；Windows 产物的签名决策（签或不签、SmartScreen 影响）也未做出并记录；
- 发布相关的使用说明（SmartScreen / Gatekeeper 绕过、Windows Shell 命令写法、中文日志编码）在 README 中缺失。

## What Changes

- 新增 devDependency `electron-builder`，在 package.json 增加 `build` 配置：`appId: com.webdeck.app`、`productName: WebDeck`、`files` 限定 `src/**`、`assets/**`、`package.json`、`asar: true`；平台目标——mac 出 `dmg` + `zip`（图标 `assets/icon.icns`，`category: public.app-category.utilities`），win 出 `nsis` + `portable`（图标 `assets/icon.ico`），linux 出 `AppImage`
- 打包态身份对齐：确认 `app.setAppUserModelId` 与 electron-builder `appId` 在打包态一致（统一 `com.webdeck.app`），保证 Windows 任务栏归属与通知正确；同步 MODIFIED 增量至 `webdeck-core` 规格的「应用身份显示项目名称」（修正 dev.sh 引用、统一 AppUserModelID 取值）
- 新增 npm scripts：`dist`（本平台构建）与 `dist:<platform>` 便于本地验证与 CI 调用
- 新增 GitHub Actions 发布流水线（`.github/workflows/release.yml`）：打 tag（`v*`）时三平台矩阵**各自原生构建**——macos-latest 出 dmg/zip 并做 Developer ID 签名 + 公证，windows-latest 出 nsis/portable，ubuntu-latest 出 AppImage——产物上传到 GitHub Releases；明确禁止在 mac runner 上交叉编译 Windows 产物
- macOS 签名与公证接入：CI secrets 使用 `CSC_LINK` / `CSC_KEY_PASSWORD`（Developer ID 证书）与 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`（公证），electron-builder 配置 `notarize`；未配置证书时本地构建可跳过签名（`CSC_IDENTITY_AUTO_DISCOVERY=false`），开发态不受影响
- Windows 签名方案决策落地：在「先不签（免费，SmartScreen 提示）」与「Azure Trusted Signing（低成本云签名）」中二选一并记录决策；未签名时 README 提供 SmartScreen「更多信息 → 仍要运行」绕过指引
- README 更新：发布流程（打 tag → CI 构建 → Releases 下载）、Windows 使用说明（Shell 命令 `%USERPROFILE%` / `cd /d` 写法、中文日志 `chcp 65001` 提示）、常见问题（SmartScreen、Gatekeeper、首次打开提示）
- 验收方式：三平台安装包实际产出且可安装启动、任务栏/Dock 显示 WebDeck 名称与图标；签名配置就绪或明确记录决策（手动验证）

## Impact

- **运行时行为**：打包不改变任何运行时逻辑；主进程、渲染层、进程管理、健康监测均无改动；开发态入口（scripts/dev.sh）不受影响
- **依赖与构建**：新增 devDependency electron-builder（含其平台工具链下载）；构建产物输出到 `dist/`（已在 .gitignore）；CI 首次构建需要下载 Electron 发行包与签名工具链，可复用 electron-builder 缓存
- **身份一致性**：`app.setAppUserModelId` 与 appId 统一为 `com.webdeck.app`，与 scripts/dev.sh 的 CFBundleIdentifier 一致；打包态与开发态的应用身份不再有差异（webdeck-core 规格「应用身份显示项目名称」同步 MODIFIED）
- **外部依赖与成本**：macOS 公证需要 Apple Developer 账号（$99/年）与 App 专用密码；Windows 签名若选 Azure Trusted Signing 需其订阅；「先不签」则零成本但 SmartScreen 提示会持续到信誉积累
- **兼容性与风险**：无持久化 schema、IPC、UI 变化；风险集中在 CI 环境（secrets 未配置时签名步骤跳过、产物不公证）与首次发布流程排错；范围边界：不做自动更新（electron-updater 留待后续）、不上架应用商店、不引入构建链改造源码

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定（本地仅验证本平台构建配置有效性；三平台产物由 CI 与手动清单验收）：

```bash
npx electron-builder --dir
```
