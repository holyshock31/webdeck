# WebDeck Core Specification

## ADDED Requirements

### Requirement: 本地进程终止的平台适配

停止本地进程与退出 WebDeck 清理进程时，按平台选择终止策略：POSIX（macOS / Linux）保持现状——向 detached 进程组发 SIGTERM、2 秒后仍存活则 SIGKILL；win32 使用 `taskkill /pid <pid> /T /F` 强制终止整棵进程树——`/F` 为必需而非可选：Windows 控制台进程（cmd/node 等无窗口进程）无法被温和终止，不带 `/F` 的 taskkill 对它们直接失败，若仅杀直接子进程会导致孙进程成为孤儿继续运行；taskkill 不可用或失败时回退为直接 kill 子进程。两种平台下停止都不得遗留孤儿进程。

#### Scenario: Windows 上停止服务不遗留子进程

用户在 Windows 上启动一个会派生子进程的 Shell 命令，点击 ⏹ 停止后，命令进程及其所有子进程均被终止，任务管理器进程树中无残留。

#### Scenario: macOS 停止行为与现状一致

用户在 macOS 上停止本地服务，仍按 SIGTERM 整组、2 秒后 SIGKILL 的二段式终止，行为与引入平台适配前完全一致。

#### Scenario: 退出 WebDeck 在 Windows 上清理进程

用户在 Windows 上配置了「退出 WebDeck 时结束该进程」的应用正在运行，正常退出 WebDeck 后该本地服务及其子进程随之结束。

### Requirement: 本地进程启动的平台适配

本地进程的 spawn 参数按平台适配：所有启动方式统一隐藏子进程控制台窗口（Windows 上不弹出黑色控制台窗口）；`detached` 仅 POSIX 使用——Windows 上 `detached: true` 会导致经 cmd.exe 启动的 node 子进程不启动且无输出（经 windows-latest 复现验证），且 Windows 终止走 taskkill 进程树、不需要进程组语义；Shell 命令模式在 Windows 上使用 `process.env.ComSpec`（cmd.exe）以 `/d /s /c` 执行，在 POSIX 上维持 `$SHELL` 或 `/bin/zsh`。

#### Scenario: Windows 启动本地服务不弹控制台窗口

用户在 Windows 上启动一个直接命令或 Shell 命令应用，WebDeck 窗口外不出现新的黑色控制台窗口，应用界面保持专注。

#### Scenario: Windows 上 Shell 命令可正常执行

用户在 Windows 上配置 Shell 命令 `cd /d %USERPROFILE%\dsh && pnpm dsh` 并启动，命令经 cmd.exe 成功执行，本地服务正常拉起，健康检查通过后状态灯变绿。

#### Scenario: macOS 上 Shell 命令行为不变

用户在 macOS 上配置 Shell 命令 `cd ~/dsh && pnpm dsh` 并启动，仍经 zsh 执行，行为与引入平台适配前一致。

### Requirement: 内置预设按平台提供可用默认命令

「添加应用」弹窗的内置预设（本地静态服务）按运行平台填入可用的默认命令：macOS / Linux 为 `python3`，Windows 为 `python`；预设其他字段（名称、URL、监测配置）不受平台影响。

#### Scenario: Windows 上选择静态服务预设

用户在 Windows 上打开添加弹窗并选择「本地静态服务」预设，Shell 命令自动填入 `python -m http.server 8000`（python3 不可用时也可用），保存并启动后本地服务可正常访问。

#### Scenario: macOS 上选择静态服务预设

用户在 macOS 上选择「本地静态服务」预设，Shell 命令仍为 `python3 -m http.server 8000`，与现状一致。

### Requirement: Windows 下本地进程日志中文可读

Windows 上本地进程的 stdout/stderr 输出进入日志面板时按 UTF-8 解码，中文内容正常显示不乱码；Shell 命令模式必要时在执行前切换控制台代码页（`chcp 65001`）以保证输出编码一致。

#### Scenario: Windows 日志面板中文正常显示

用户在 Windows 上启动一个输出中文日志的本地服务并打开日志面板，中文日志逐行正常显示，无乱码。

### Requirement: 跨平台回归由三平台 CI 守护

仓库提供 GitHub Actions 工作流，在 macos-latest / windows-latest / ubuntu-latest 三个 runner 上分别执行 `npm test` 与 `npm run smoke`（Linux runner 用 `xvfb-run` 提供虚拟显示），任一平台失败即工作流失败，作为跨平台回归的自动验收手段。

#### Scenario: 推送到 GitHub 后三平台自动验证

用户推送代码到 GitHub 远端，CI 在 macOS、Windows、Linux 三个 runner 上自动运行 `npm test` 与 `npm run smoke`，三平台全部通过则工作流绿色。

#### Scenario: Windows 平台回归失败被拦截

某个改动破坏了 Windows 上的进程终止逻辑，CI 的 windows-latest runner 上 `npm run smoke` 失败，工作流标红，改动不能合入。

## MODIFIED Requirements

### Requirement: 开发态启动入口保持可用

npm start 通过 `scripts/dev.sh` 平台分发启动：macOS 下首次运行生成改名的 WebDeck.app 副本（Electron 版本变化时自动重建，已有副本则复用），之后经该副本启动；非 macOS 平台直接回退执行 `electron .`，行为与现状一致。脚本名由 dev-mac.sh 改为 dev.sh，README 与 package.json 相应更新。

#### Scenario: macOS 首次启动生成改名副本

用户在 macOS 执行 npm start，脚本生成 dist/WebDeck.app（CFBundleName / CFBundleDisplayName 为 WebDeck，可执行文件名为 WebDeck），Dock 显示 WebDeck。

#### Scenario: Electron 版本升级后自动重建

用户升级 electron 依赖后再次 npm start，脚本检测到版本变化并重新生成 WebDeck.app 副本，无需手动清理。

#### Scenario: 非 macOS 平台回退

用户在 Linux / Windows 执行 npm start，直接以 `electron .` 启动，不生成副本，原有功能不受影响。
