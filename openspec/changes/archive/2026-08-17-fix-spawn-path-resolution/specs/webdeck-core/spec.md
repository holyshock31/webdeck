# WebDeck Core Specification

## ADDED Requirements

### Requirement: Windows 直接命令模式的可执行文件解析

Windows 上「直接命令」启动方式使用自实现的可执行文件解析：按 PATH 顺序 + PATHEXT 查找——**跳过无扩展名且非可执行的文件**（npm 等工具生成的无扩展名 shim 会导致 libuv 原样命中后 CreateProcess 失败报 ENOENT 的陷阱），命中 `.exe` / `.com` 直接执行，命中 `.cmd` / `.bat` 转经 cmd.exe（`/d /s /c`）执行；未命中时报 ENOENT 且诊断信息记录尝试过的目录。POSIX（macOS / Linux）行为不变（直接 spawn，无扩展名文件本身可执行）。

#### Scenario: Windows 上 npm 全局工具可直接命令启动

用户在 Windows 上配置直接命令 `dsh --profile web`（`C:\Program Files\nodejs` 下同时存在无扩展名 shim `dsh` 与 `dsh.cmd`），点击 ▶ 后命令解析跳过无扩展名 shim、命中 `dsh.cmd` 并经 cmd.exe 执行，本地服务正常拉起，健康检查通过后状态灯变绿。

#### Scenario: Windows 上 .exe 应用直接执行

用户配置直接命令 `notepad.exe`（或带参数），点击 ▶ 后直接创建进程执行，不经 cmd.exe，参数原样传递。

#### Scenario: Windows 上 .cmd 应用可启动

用户配置直接命令指向一个 `.cmd` 脚本（如 `C:\tools\start-dev.cmd --port 8000`），点击 ▶ 后经 cmd.exe 执行成功，命令输出进入日志面板。

#### Scenario: 命令未命中时报错并给出解析过程

用户配置一个不存在的直接命令，点击 ▶ 后状态变为 error，日志面板显示 `[spawn error] ENOENT` 且记录解析过程（按 PATH 尝试过的目录、跳过/命中的文件），据此可直接判断命令名错误还是 PATH 缺失。

#### Scenario: macOS 直接命令行为不变

用户在 macOS 上配置直接命令（如 `python3 -m http.server`），仍直接 spawn 执行（POSIX 无扩展名文件本身可执行），行为与现状一致。

### Requirement: 本地进程启动的 PATH 解析健壮性

本地进程的 PATH 解析按平台与启动方式适配：启动本地命令前，在现有 PATH 基础上**补全常见用户 bin 目录**（已存在的不重复追加）——POSIX 补 Homebrew、`~/.local/bin`、pnpm、npm-global、yarn、bun、nvm 版本目录；win32 补 `C:\Program Files\nodejs`（npm 全局 prefix 常见位置）、`%LOCALAPPDATA%\pnpm`、`%APPDATA%\npm`、`%USERPROFILE%\.local\bin`。win32 且进程内 PATH 为空（GUI 应用由 explorer 启动时超长 PATH 可能被整体丢弃）时，从注册表（HKLM 系统 + HKCU 用户）合并 PATH 兜底，**注册表值中的 `%VAR%` 变量正确展开**（如 `%appdata%\npm`、`%SYSTEMROOT%`，大小写不敏感）。用户显式配置的 PATH 优先，不被补全覆盖。

#### Scenario: macOS 打包版（Finder 启动）可拉起 pnpm 命令

用户在 macOS 从 Finder 启动打包版 WebDeck，其应用配置 Shell 命令 `pnpm dsh`（GUI 启动 PATH 只有系统默认目录），点击 ▶ 后 `pnpm` 可解析，本地服务正常拉起，健康检查通过后状态灯变绿。

#### Scenario: Windows GUI 启动 PATH 为空时可拉起命令

用户在 Windows 通过快捷方式/双击启动 WebDeck（进程内 PATH 为空），其应用配置直接命令（如 `dsh --profile web`），点击 ▶ 后命令可解析（注册表合并 PATH 兜底生效，`%VAR%` 正确展开为实际路径），本地服务正常拉起。

#### Scenario: 用户显式配置的 PATH 不被覆盖

用户在该应用的环境变量中显式配置 `PATH=D:\custom\bin`，启动本地命令时该 PATH 被优先使用，补全仅在原有基础上追加缺失目录，不替换用户配置。

#### Scenario: 已存在的目录不重复追加

PATH 中已包含 `/opt/homebrew/bin` 时启动本地命令，补全不产生重复条目，命令解析结果不变。

### Requirement: spawn 失败时日志面板提供诊断上下文

本地命令 spawn 失败（如 Windows 上 ENOENT）时，日志面板除错误信息外记录**命令全文、工作目录 cwd、PATH（截断 600 字符）**；win32 直接命令模式额外记录**解析过程**（按 PATH 尝试过的目录、跳过/命中的文件），便于区分「命令名错误 / 工作目录无效 / PATH 缺失 / 无扩展名 shim 陷阱」等不同成因。

#### Scenario: Windows ENOENT 时日志显示完整诊断

用户在 Windows 上启动一个命令找不到的应用，打开日志面板看到 `[spawn error] spawn dsh ENOENT`，下方跟随 `command:` / `cwd:` / `PATH:` 三行诊断信息及解析过程记录，据此可判断是命令名错误还是 PATH 缺失。

#### Scenario: 无扩展名 shim 陷阱在日志中可见

用户在 Windows 上启动直接命令 `dsh`（存在无扩展名 shim 与 `dsh.cmd`），若解析仍失败，日志面板的解析过程记录显示「跳过了无扩展名文件 `...\nodejs\dsh`」等细节，可直接定位成因。
