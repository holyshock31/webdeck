# WebDeck Core Specification

## MODIFIED Requirements

### Requirement: 应用身份显示项目名称

WebDeck 的应用身份显示为项目名 "WebDeck" 而非 Electron 默认值：macOS 的 Dock 悬停提示与 ⌘Tab 切换器、Windows 的任务栏 hover 与通知归属、macOS 菜单栏应用菜单标题均使用 WebDeck。开发态（未打包 `electron .`）下，macOS 经改名的应用包副本（scripts/dev.sh）启动，Windows 经 AppUserModelID 声明；打包态（electron-builder）下 `appId` 统一为 `com.webdeck.app`——与 scripts/dev.sh 的 CFBundleIdentifier 一致，`app.setAppUserModelId` 与打包 `appId` 一致，Windows 产物以 `com.webdeck.app` 注册 AppUserModelID，开发态与打包态的应用身份不再有差异。

#### Scenario: macOS Dock 悬停显示 WebDeck

用户通过 npm start 启动 WebDeck 后，将鼠标悬停到 Dock 图标上，提示文字显示 WebDeck，而非 Electron。

#### Scenario: ⌘Tab 切换器显示项目名

macOS 下按 ⌘Tab 切换应用，WebDeck 条目显示名称为 WebDeck。

#### Scenario: Windows 任务栏显示项目名

Windows 下启动 WebDeck（开发态或安装打包产物），任务栏按钮 hover 与通知归属显示 WebDeck；打包产物以 `com.webdeck.app` 注册 AppUserModelID，与 electron-builder `appId` 及开发态身份一致。

#### Scenario: 菜单栏应用菜单标题

macOS 下菜单栏最左侧的应用菜单标题为 WebDeck。
