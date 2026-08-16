# Proposal — support-cross-platform

## Why

WebDeck 目前仅在 macOS 上验证通过，核心的本地进程管理实现是 POSIX/macOS 专属的，Windows 上不可用：

- `src/main/process-manager.js` 用负 PID 进程组信号（`process.kill(-pid, 'SIGTERM')` / `SIGKILL`）终止进程树，Windows 没有负 PID 语义，Node 会把任何信号直接映射为 TerminateProcess（强杀、无优雅退出、且只杀主进程不杀子进程）；
- `spawn(..., { detached: true })` 在 Windows 上会为子进程弹出独立的控制台窗口，用户每次启动本地服务都会闪黑窗；
- Shell 模式的默认 shell 取 `process.env.SHELL || '/bin/zsh'`，Windows 没有 `SHELL` 环境变量、也不存在 `/bin/zsh`，Shell 命令启动方式在 Windows 上必然失败；
- 开发态入口 `scripts/dev-mac.sh` 依赖 `plutil`/`.app` 结构（macOS 专属改名副本），虽然已有非 darwin 回退，但脚本名与 README 描述都仍以 macOS 为中心；
- 内置预设（本地静态服务 `python3 -m http.server`）写死在渲染层，Windows 上 `python3` 通常不存在；
- 没有任何跨平台回归手段：`npm test` / `npm run smoke` 只在本机跑，平台回归无保障。

## What Changes

- `src/main/process-manager.js` 平台抽象：POSIX 保持现状（detached 进程组 + SIGTERM 整组、2 秒后 SIGKILL）；win32 改用 `taskkill /pid <pid> /T`（必要时追加 `/F`）终止整棵进程树，taskkill 不可用或失败时回退 `child.kill`；`stop` 与 `stopMany` 都走平台分发
- 所有 `spawn` 统一加 `windowsHide: true`，Windows 上不再弹出控制台窗口
- Shell 模式默认 shell 按平台选择：win32 用 `process.env.ComSpec`（cmd.exe，`/d /s /c` 执行）；POSIX 维持 `$SHELL` 或 `/bin/zsh`
- 开发态入口平台分发：`scripts/dev-mac.sh` 重命名为 `scripts/dev.sh`（逻辑不变：非 darwin 直接 `electron .`，macOS 保留改名 .app 副本逻辑），`package.json` 的 `start` 脚本与 README 相应更新
- 内置预设按平台给默认命令：本地静态服务 macOS/Linux 用 `python3`、Windows 用 `python`；平台信息经 preload 桥暴露给渲染层
- 新增 GitHub Actions 三平台矩阵（macos-latest / windows-latest / ubuntu-latest）：`npm test` + `npm run smoke`（Linux runner 用 `xvfb-run` 提供虚拟显示）
- 文档：README 补充 Windows/Linux 快速开始、Shell 命令的 Windows 写法（`%USERPROFILE%`、`cd /d`）、中文日志编码提示（`chcp 65001`）与常见问题

## Impact

- **运行时行为**：macOS / Linux（POSIX）行为完全不变；Windows 获得可用的本地进程启动/终止语义（无控制台窗口、进程树可整树终止）
- **模块边界**：`process-manager.js` 维持纯 Node 可单测约束；平台差异抽成可单测的纯函数（shell 解析、终止命令构造），测试不依赖真实平台
- **兼容性**：无持久化 schema 变化、无 IPC 协议变化、无 UI 布局变化；应用配置完全兼容
- **风险与已知平台差异**：Windows 的 `taskkill /T /F` 是强杀语义，与 macOS 的「SIGTERM 优雅退出 → 2 秒后 SIGKILL」二段式不同，接受为平台差异并写入文档；CI 首次接入可能需要调整 runner 环境（xvfb、Electron 二进制缓存复用）
- **范围边界**：不做打包发布（另立 packaging-release 变更）、不做自动更新、不引入构建链；验收方式为三平台 CI 全绿 + Windows 手动验证清单

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
