# Verification — set-app-name

Date: 2026-08-16T19:11:09.447Z
Change: openspec/changes/set-app-name
Model: deepseek-official / deepseek-v4-flash (flash)

**7/7 scenarios passed**

## Scenarios

| # | Result | Requirement | Scenario | Reason |
|---|--------|-------------|----------|--------|
| 1 | ✅ | 应用身份显示项目名称 | macOS Dock 悬停显示 WebDeck | scripts/dev-mac.sh 生成 WebDeck.app（CFBundleName/DisplayName 改为 WebDeck），Dock 显示项目名。 |
| 2 | ✅ | 应用身份显示项目名称 | ⌘Tab 切换器显示项目名 | scripts/dev-mac.sh 改写 CFBundleName/CFBundleDisplayName，⌘Tab 显示 WebDeck。 |
| 3 | ✅ | 应用身份显示项目名称 | Windows 任务栏显示项目名 | src/main/index.js 调用 app.setAppUserModelId('com.webdeck.WebDeck')，符合 AppUserModelID 声明要求。 |
| 4 | ✅ | 应用身份显示项目名称 | 菜单栏应用菜单标题 | 主进程调用 app.setName('WebDeck')，buildMenu 使用 app.name 作为 macOS 应用菜单标题。 |
| 5 | ✅ | 开发态启动入口保持可用 | macOS 首次启动生成改名副本 | scripts/dev-mac.sh 复制 Electron.app 为 dist/WebDeck.app，改写 CFBundleName/DisplayName/Executable 为 WebDeck，并重命名可执行文件。 |
| 6 | ✅ | 开发态启动入口保持可用 | Electron 版本升级后自动重建 | dev-mac.sh 使用 MARKER 记录版本号，检测到 SRC_VER 变化时重新生成副本。 |
| 7 | ✅ | 开发态启动入口保持可用 | 非 macOS 平台回退 | dev-mac.sh 在非 Darwin 平台 exec node_modules/.bin/electron "$ROOT"，直接以 electron . 启动。 |

## Raw judge output

```
OK|应用身份显示项目名称: macOS Dock 悬停显示 WebDeck — scripts/dev-mac.sh 生成 WebDeck.app（CFBundleName/DisplayName 改为 WebDeck），Dock 显示项目名。
OK|应用身份显示项目名称: ⌘Tab 切换器显示项目名 — scripts/dev-mac.sh 改写 CFBundleName/CFBundleDisplayName，⌘Tab 显示 WebDeck。
OK|应用身份显示项目名称: Windows 任务栏显示项目名 — src/main/index.js 调用 app.setAppUserModelId('com.webdeck.WebDeck')，符合 AppUserModelID 声明要求。
OK|应用身份显示项目名称: 菜单栏应用菜单标题 — 主进程调用 app.setName('WebDeck')，buildMenu 使用 app.name 作为 macOS 应用菜单标题。
OK|开发态启动入口保持可用: macOS 首次启动生成改名副本 — scripts/dev-mac.sh 复制 Electron.app 为 dist/WebDeck.app，改写 CFBundleName/DisplayName/Executable 为 WebDeck，并重命名可执行文件。
OK|开发态启动入口保持可用: Electron 版本升级后自动重建 — dev-mac.sh 使用 MARKER 记录版本号，检测到 SRC_VER 变化时重新生成副本。
OK|开发态启动入口保持可用: 非 macOS 平台回退 — dev-mac.sh 在非 Darwin 平台 exec node_modules/.bin/electron "$ROOT"，直接以 electron . 启动。
```
