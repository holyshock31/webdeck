# WebDeck Core Specification

## ADDED Requirements

### Requirement: 应用身份显示项目名称

WebDeck 的应用身份显示为项目名 "WebDeck" 而非 Electron 默认值：macOS 的 Dock 悬停提示与 ⌘Tab 切换器、Windows 的任务栏 hover 与通知归属、macOS 菜单栏应用菜单标题均使用 WebDeck。开发态（未打包 `electron .`）下，macOS 经改名的应用包副本（scripts/dev-mac.sh）启动，Windows 经 AppUserModelID 声明（com.webdeck.WebDeck）。

#### Scenario: macOS Dock 悬停显示 WebDeck

用户通过 npm start 启动 WebDeck 后，将鼠标悬停到 Dock 图标上，提示文字显示 WebDeck，而非 Electron。

#### Scenario: ⌘Tab 切换器显示项目名

macOS 下按 ⌘Tab 切换应用，WebDeck 条目显示名称为 WebDeck。

#### Scenario: Windows 任务栏显示项目名

Windows 下启动 WebDeck，任务栏按钮 hover 与通知归属显示 WebDeck，应用以 com.webdeck.WebDeck 注册 AppUserModelID。

#### Scenario: 菜单栏应用菜单标题

macOS 下菜单栏最左侧的应用菜单标题为 WebDeck。

### Requirement: 开发态启动入口保持可用

npm start 通过 scripts/dev-mac.sh 启动：macOS 下首次运行生成改名的 WebDeck.app 副本（Electron 版本变化时自动重建，已有副本则复用），之后经该副本启动；非 macOS 平台直接回退执行 `electron .`，行为与现状一致。

#### Scenario: macOS 首次启动生成改名副本

用户在 macOS 执行 npm start，脚本生成 dist/WebDeck.app（CFBundleName / CFBundleDisplayName 为 WebDeck，可执行文件名为 WebDeck），Dock 显示 WebDeck。

#### Scenario: Electron 版本升级后自动重建

用户升级 electron 依赖后再次 npm start，脚本检测到版本变化并重新生成 WebDeck.app 副本，无需手动清理。

#### Scenario: 非 macOS 平台回退

用户在 Linux / Windows 执行 npm start，直接以 `electron .` 启动，不生成副本，原有功能不受影响。
