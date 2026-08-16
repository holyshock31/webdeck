## Why

开发态（未打包，直接 `electron .`）运行时，WebDeck 的应用身份显示为 Electron 默认值：macOS 的 Dock 悬停提示与 ⌘Tab 切换器显示 "Electron"（该名称取自 `node_modules/electron/dist/Electron.app` 包的 Info.plist，运行时 API 无法修改）；Windows 任务栏/通知按默认身份归属 electron。用户希望 Dock/任务栏悬停显示项目名 "WebDeck"。

## What Changes

- 运行时身份声明（`src/main/index.js` 启动时执行）：`app.setName('WebDeck')` 与 `app.setAppUserModelId('com.webdeck.WebDeck')`——覆盖菜单栏应用名，并让 Windows 任务栏/通知按 WebDeck 归属（macOS 上无副作用）
- macOS 开发态启动入口（`scripts/dev-mac.sh`）：把 Electron.app 复制为 `dist/WebDeck.app`，改写包内 `CFBundleName` / `CFBundleDisplayName` / `CFBundleIdentifier` / `CFBundleExecutable` 并把可执行文件改名为 WebDeck，使 Dock 悬停与 ⌘Tab 显示 WebDeck；Electron 版本变化时自动重建副本，非 macOS 平台回退直接 `electron .`
- `package.json`：`start` 脚本改为 `bash scripts/dev-mac.sh`
- 新增 `proposal.md`（本文件）与 `tasks.md`
- 注：工作区已存在此前讨论阶段落下的部分代码（index.js 身份声明、dev-mac.sh、start 脚本），实现阶段需与提案核对并补完验证，不以现有代码代替规格
- 范围：新增能力；验收方式为手动验证（macOS Dock 与 Windows 任务栏均需显示 WebDeck）

## Impact

- **运行时行为**：仅应用外壳的身份展示变化；应用配置、进程管理、健康监测、IPC 均不变；userData 路径不变（productName 已是 WebDeck）
- **体积与首次运行**：macOS 开发态首次 `npm start` 需复制约 250MB 的 Electron.app 到 `dist/`（已 gitignore）；后续复用副本
- **兼容性**：非 macOS 平台回退行为与现状完全一致；Windows 额外受益于 AppUserModelID（通知/任务栏归属）
- **风险**：低；可执行文件改名与 electron-packager 同款做法；验收方式为手动验证
- **范围边界**：仅解决开发态（未打包）运行的身份显示；正式打包分发（electron-builder/forge 等）不在本次范围
