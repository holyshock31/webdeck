# WebDeck Core Specification

## ADDED Requirements

### Requirement: 本地进程启动的 PATH 解析健壮性

本地进程的 PATH 解析按平台与启动方式适配：启动本地命令前，在现有 PATH 基础上**补全常见用户 bin 目录**（已存在的不重复追加）——POSIX 补 Homebrew、`~/.local/bin`、pnpm、npm-global、yarn、bun、nvm 版本目录；win32 补 `C:\Program Files\nodejs`（npm 全局 prefix 常见位置）、`%LOCALAPPDATA%\pnpm`、`%APPDATA%\npm`、`%USERPROFILE%\.local\bin`。win32 且进程内 PATH 为空（GUI 应用由 explorer 启动时超长 PATH 可能被整体丢弃）时，从注册表（HKLM 系统 + HKCU 用户）合并 PATH 兜底。用户显式配置的 PATH 优先，不被补全覆盖。

#### Scenario: macOS 打包版（Finder 启动）可拉起 pnpm 命令

用户在 macOS 从 Finder 启动打包版 WebDeck，其应用配置 Shell 命令 `pnpm dsh`（GUI 启动 PATH 只有系统默认目录），点击 ▶ 后 `pnpm` 可解析，本地服务正常拉起，健康检查通过后状态灯变绿。

#### Scenario: Windows GUI 启动 PATH 为空时可拉起 dsh

用户在 Windows 通过快捷方式/双击启动 WebDeck（进程内 PATH 为空），其应用配置直接命令 `dsh --profile web`，点击 ▶ 后命令可解析（注册表合并 PATH 生效），本地服务正常拉起。

#### Scenario: 用户显式配置的 PATH 不被覆盖

用户在该应用的环境变量中显式配置 `PATH=D:\custom\bin`，启动本地命令时该 PATH 被优先使用，补全仅在原有基础上追加缺失目录，不替换用户配置。

#### Scenario: 已存在的目录不重复追加

PATH 中已包含 `/opt/homebrew/bin` 时启动本地命令，补全不产生重复条目，命令解析结果不变。

### Requirement: spawn 失败时日志面板提供诊断上下文

本地命令 spawn 失败（如 Windows 上 ENOENT）时，日志面板除错误信息外记录**命令全文、工作目录 cwd、PATH（截断 600 字符）**，便于区分「命令找不到 / 工作目录无效 / PATH 缺失」等不同成因。

#### Scenario: Windows ENOENT 时日志显示完整诊断

用户在 Windows 上启动一个命令找不到的应用，打开日志面板看到 `[spawn error] spawn dsh ENOENT`，下方跟随 `command:` / `cwd:` / `PATH:` 三行诊断信息，据此可判断是 PATH 缺失还是命令名错误。
