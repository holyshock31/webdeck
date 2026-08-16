# Tasks — add-packaging-release

- [x] package.json：新增 devDependency electron-builder（锁定版本）并补充 `build` 配置——appId `com.webdeck.app`、productName WebDeck、files 限定 `src/**`、`assets/**`、`package.json`、asar 打包
- [x] package.json build 配置：平台目标与图标——mac 出 dmg+zip（icon `assets/icon.icns`，category `public.app-category.utilities`）、win 出 nsis+portable（icon `assets/icon.ico`）、linux 出 AppImage（icon 用 assets 下的 png 或生成 icons 目录）
- [x] package.json：新增 npm scripts——`dist`（当前平台构建）、`dist:mac`、`dist:win`、`dist:linux`，供本地验证与 CI 调用
- [x] src/main/index.js：核对 `app.setAppUserModelId` 与 electron-builder appId 在打包态一致（统一 `com.webdeck.app`），不一致则调整，保证 Windows 任务栏归属正确
- [x] 本地验证：macOS 上运行 `npx electron-builder --dir` 产出 WebDeck.app（身份/图标/asar 校验通过），打包产物直接跑 `--smoke` 端到端 **SMOKE_OK**；`npm run dist:mac` 产出 zip（121MB）——dmg 因本机沙箱禁止 hdiutil 无法产出，由 CI/真机覆盖（release.yml 已配置）
- [x] 新增 .github/workflows/release.yml：打 tag（`v*`）触发，三平台矩阵各自原生构建（macos-latest 出 dmg/zip、windows-latest 出 nsis/portable、ubuntu-latest 出 AppImage），产物上传 GitHub Releases；不在 mac runner 上交叉编译 Windows 产物
- [x] release.yml 接入 macOS 签名与公证：使用 secrets `CSC_LINK` / `CSC_KEY_PASSWORD` 与 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`，electron-builder 开启 notarize；secrets 缺失时跳过签名并标记产物未公证
- [x] Windows 签名决策落地：在「先不签」与「Azure Trusted Signing」中二选一，决策记录到 README 发布流程小节与仓库文档
- [x] README.md：新增发布流程（打 tag → CI 构建 → GitHub Releases 下载）、Windows 使用说明（Shell 命令 `%USERPROFILE%` / `cd /d` 写法、中文日志 `chcp 65001` 提示）、常见问题（SmartScreen 绕过指引、Gatekeeper 首次打开提示、未签名产物的说明）
- [x] 手动验收清单：清单文档化于 docs/manual-verification-packaging.md（macOS dmg 安装后 Dock 与菜单栏显示 WebDeck 名称与图标；Windows NSIS 安装与 portable 解压即用；Linux AppImage `chmod +x` 后可运行；三平台安装包内应用功能与开发态一致）；真机执行留待验收
