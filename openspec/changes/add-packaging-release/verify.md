# Verification — add-packaging-release

Date: 2026-08-17T05:32:49.991Z
Change: openspec/changes/add-packaging-release
Model: deepseek-official / deepseek-v4-flash (flash)

**15/15 scenarios passed**

## Scenarios

| # | Result | Requirement | Scenario | Reason |
|---|--------|-------------|----------|--------|
| 1 | ✅ | webdeck-core | 应用身份显示项目名称 | macOS Dock 悬停显示 WebDeck — dev.sh 创建改名的 WebDeck.app 副本，CFBundleName/DisplayName 设为 WebDeck |
| 2 | ✅ | webdeck-core | 应用身份显示项目名称 | ⌘Tab 切换器显示项目名 — dev.sh 改名的 WebDeck.app 副本确保 ⌘Tab 显示 WebDeck |
| 3 | ✅ | webdeck-core | 应用身份显示项目名称 | Windows 任务栏显示项目名 — app.setAppUserModelId('com.webdeck.app') 与打包 appId 一致，productName 为 WebDeck |
| 4 | ✅ | webdeck-core | 应用身份显示项目名称 | 菜单栏应用菜单标题 — index.js 使用 app.getName() 构建菜单，app.setName('WebDeck') 确保标题为 WebDeck |
| 5 | ✅ | webdeck-packaging | 跨平台安装包通过 GitHub Releases 分发 | 打 tag 后三平台产物出现在 Releases — release.yml 三平台矩阵各自原生构建并上传 dmg/zip/exe/AppImage 到 Releases |
| 6 | ✅ | webdeck-packaging | 跨平台安装包通过 GitHub Releases 分发 | Windows 产物由 Windows runner 产出 — release.yml 中 windows-latest runner 单独构建 --win，无交叉编译 |
| 7 | ✅ | webdeck-packaging | 跨平台安装包通过 GitHub Releases 分发 | 安装包内容限定应用本体 — build.files 限定 src/**、assets/**、package.json，asar: true |
| 8 | ✅ | webdeck-packaging | macOS 安装包签名与公证 | 已签名公证的 dmg 可直接安装 — release.yml 配置 CSC_LINK/secrets 且 notarize=true 时自动签名公证，README 有未签名指引 |
| 9 | ✅ | webdeck-packaging | macOS 安装包签名与公证 | 未签名构建可跳过签名 — release.yml 有 CSC_LINK 为空时构建 unsigned 产物分支，README 记录 CSC_IDENTITY_AUTO_DISCOVERY=false |
| 10 | ✅ | webdeck-packaging | Windows 安装包可安装启动且任务栏显示 WebDeck | NSIS 安装并启动 — build.nsis 配置 perMachine:false、createStartMenuShortcut:true，appId com.webdeck.app |
| 11 | ✅ | webdeck-packaging | Windows 安装包可安装启动且任务栏显示 WebDeck | portable 版解压即用 — build.win.target 包含 portable，任务栏显示由 app.setAppUserModelId 保证 |
| 12 | ✅ | webdeck-packaging | Windows 安装包可安装启动且任务栏显示 WebDeck | 未签名产物的 SmartScreen 提示有据可查 — README 常见问题明确记录 SmartScreen「更多信息 → 仍要运行」绕过指引 |
| 13 | ✅ | webdeck-packaging | Linux AppImage 可直接运行 | 运行 AppImage — build.linux.target 为 AppImage，README 说明 chmod +x 后运行 |
| 14 | ✅ | webdeck-packaging | 发布流程与平台差异有文档指引 | 按 README 完成一次发布 — README 发布流程明确打 tag → CI → Releases 下载步骤，release.yml 自动上传 |
| 15 | ✅ | webdeck-packaging | 发布流程与平台差异有文档指引 | Windows 用户在文档中找到 Shell 命令写法 — README 跨平台说明含 `cd /d %USERPROFILE%\dsh && pnpm dsh` 与 chcp 65001 示例 |

## Raw judge output

```
OK|webdeck-core: 应用身份显示项目名称 — macOS Dock 悬停显示 WebDeck — dev.sh 创建改名的 WebDeck.app 副本，CFBundleName/DisplayName 设为 WebDeck

OK|webdeck-core: 应用身份显示项目名称 — ⌘Tab 切换器显示项目名 — dev.sh 改名的 WebDeck.app 副本确保 ⌘Tab 显示 WebDeck

OK|webdeck-core: 应用身份显示项目名称 — Windows 任务栏显示项目名 — app.setAppUserModelId('com.webdeck.app') 与打包 appId 一致，productName 为 WebDeck

OK|webdeck-core: 应用身份显示项目名称 — 菜单栏应用菜单标题 — index.js 使用 app.getName() 构建菜单，app.setName('WebDeck') 确保标题为 WebDeck

OK|webdeck-packaging: 跨平台安装包通过 GitHub Releases 分发 — 打 tag 后三平台产物出现在 Releases — release.yml 三平台矩阵各自原生构建并上传 dmg/zip/exe/AppImage 到 Releases

OK|webdeck-packaging: 跨平台安装包通过 GitHub Releases 分发 — Windows 产物由 Windows runner 产出 — release.yml 中 windows-latest runner 单独构建 --win，无交叉编译

OK|webdeck-packaging: 跨平台安装包通过 GitHub Releases 分发 — 安装包内容限定应用本体 — build.files 限定 src/**、assets/**、package.json，asar: true

OK|webdeck-packaging: macOS 安装包签名与公证 — 已签名公证的 dmg 可直接安装 — release.yml 配置 CSC_LINK/secrets 且 notarize=true 时自动签名公证，README 有未签名指引

OK|webdeck-packaging: macOS 安装包签名与公证 — 未签名构建可跳过签名 — release.yml 有 CSC_LINK 为空时构建 unsigned 产物分支，README 记录 CSC_IDENTITY_AUTO_DISCOVERY=false

OK|webdeck-packaging: Windows 安装包可安装启动且任务栏显示 WebDeck — NSIS 安装并启动 — build.nsis 配置 perMachine:false、createStartMenuShortcut:true，appId com.webdeck.app

OK|webdeck-packaging: Windows 安装包可安装启动且任务栏显示 WebDeck — portable 版解压即用 — build.win.target 包含 portable，任务栏显示由 app.setAppUserModelId 保证

OK|webdeck-packaging: Windows 安装包可安装启动且任务栏显示 WebDeck — 未签名产物的 SmartScreen 提示有据可查 — README 常见问题明确记录 SmartScreen「更多信息 → 仍要运行」绕过指引

OK|webdeck-packaging: Linux AppImage 可直接运行 — 运行 AppImage — build.linux.target 为 AppImage，README 说明 chmod +x 后运行

OK|webdeck-packaging: 发布流程与平台差异有文档指引 — 按 README 完成一次发布 — README 发布流程明确打 tag → CI → Releases 下载步骤，release.yml 自动上传

OK|webdeck-packaging: 发布流程与平台差异有文档指引 — Windows 用户在文档中找到 Shell 命令写法 — README 跨平台说明含 `cd /d %USERPROFILE%\dsh && pnpm dsh` 与 chcp 65001 示例
```
