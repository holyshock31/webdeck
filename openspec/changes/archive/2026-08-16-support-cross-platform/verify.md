# Verification — support-cross-platform

Date: 2026-08-16T20:28:05.251Z
Change: openspec/changes/support-cross-platform
Model: deepseek-official / deepseek-v4-flash (flash)

**14/14 scenarios passed**

## Scenarios

| # | Result | Requirement | Scenario | Reason |
|---|--------|-------------|----------|--------|
| 1 | ✅ | 本地进程终止的平台适配 | Windows 上停止服务不遗留子进程 | process-manager.js 在 win32 上使用 taskkill /T /F 终止整棵进程树，stop 和 stopMany 均走此路径。 |
| 2 | ✅ | 本地进程终止的平台适配 | macOS 停止行为与现状一致 | POSIX 路径保留 SIGTERM 整组、2 秒后 SIGKILL 的二段式终止逻辑。 |
| 3 | ✅ | 本地进程终止的平台适配 | 退出 WebDeck 在 Windows 上清理进程 | before-quit 调用 procs.stopMany，win32 路径使用 taskkill /T /F 终止进程树。 |
| 4 | ✅ | 本地进程启动的平台适配 | Windows 启动本地服务不弹控制台窗口 | spawn 统一设置 windowsHide: true。 |
| 5 | ✅ | 本地进程启动的平台适配 | Windows 上 Shell 命令可正常执行 | resolveShell 在 win32 返回 ComSpec（cmd.exe），shellArgs 返回 /d /s /c，spawnDetached 在 win32 返回 false。 |
| 6 | ✅ | 本地进程启动的平台适配 | macOS 上 Shell 命令行为不变 | POSIX 使用 $SHELL 或 /bin/zsh，shellArgs 为 -lc。 |
| 7 | ✅ | 内置预设按平台提供可用默认命令 | Windows 上选择静态服务预设 | app.js 中 STATIC_SERVER_CMD 在 win32 为 'python -m http.server 8000'。 |
| 8 | ✅ | 内置预设按平台提供可用默认命令 | macOS 上选择静态服务预设 | app.js 中 STATIC_SERVER_CMD 在非 win32 为 'python3 -m http.server 8000'。 |
| 9 | ✅ | Windows 下本地进程日志中文可读 | Windows 日志面板中文正常显示 | 日志以 Buffer 按 UTF-8 解码（chunk.toString()），README 提示用 chcp 65001。 |
| 10 | ✅ | 跨平台回归由三平台 CI 守护 | 推送到 GitHub 后三平台自动验证 | ci.yml 矩阵包含 macos-latest、windows-latest、ubuntu-latest，执行 npm test 与 npm run smoke。 |
| 11 | ✅ | 跨平台回归由三平台 CI 守护 | Windows 平台回归失败被拦截 | ci.yml 中 windows-latest runner 执行 npm test 与 npm run smoke，任一失败导致工作流失败。 |
| 12 | ✅ | 开发态启动入口保持可用 | macOS 首次启动生成改名副本 | dev.sh 在 Darwin 上复制 Electron.app 为 dist/WebDeck.app 并修改 CFBundleName、CFBundleDisplayName、CFBundleExecutable 为 WebDeck。 |
| 13 | ✅ | 开发态启动入口保持可用 | Electron 版本升级后自动重建 | dev.sh 读取源 Electron 版本存入 MARKER，版本变化时重建副本。 |
| 14 | ✅ | 开发态启动入口保持可用 | 非 macOS 平台回退 | dev.sh 在非 Darwin 平台直接 exec electron .，不生成副本。 |

## Raw judge output

```
OK|本地进程终止的平台适配: Windows 上停止服务不遗留子进程 — process-manager.js 在 win32 上使用 taskkill /T /F 终止整棵进程树，stop 和 stopMany 均走此路径。

OK|本地进程终止的平台适配: macOS 停止行为与现状一致 — POSIX 路径保留 SIGTERM 整组、2 秒后 SIGKILL 的二段式终止逻辑。

OK|本地进程终止的平台适配: 退出 WebDeck 在 Windows 上清理进程 — before-quit 调用 procs.stopMany，win32 路径使用 taskkill /T /F 终止进程树。

OK|本地进程启动的平台适配: Windows 启动本地服务不弹控制台窗口 — spawn 统一设置 windowsHide: true。

OK|本地进程启动的平台适配: Windows 上 Shell 命令可正常执行 — resolveShell 在 win32 返回 ComSpec（cmd.exe），shellArgs 返回 /d /s /c，spawnDetached 在 win32 返回 false。

OK|本地进程启动的平台适配: macOS 上 Shell 命令行为不变 — POSIX 使用 $SHELL 或 /bin/zsh，shellArgs 为 -lc。

OK|内置预设按平台提供可用默认命令: Windows 上选择静态服务预设 — app.js 中 STATIC_SERVER_CMD 在 win32 为 'python -m http.server 8000'。

OK|内置预设按平台提供可用默认命令: macOS 上选择静态服务预设 — app.js 中 STATIC_SERVER_CMD 在非 win32 为 'python3 -m http.server 8000'。

OK|Windows 下本地进程日志中文可读: Windows 日志面板中文正常显示 — 日志以 Buffer 按 UTF-8 解码（chunk.toString()），README 提示用 chcp 65001。

OK|跨平台回归由三平台 CI 守护: 推送到 GitHub 后三平台自动验证 — ci.yml 矩阵包含 macos-latest、windows-latest、ubuntu-latest，执行 npm test 与 npm run smoke。

OK|跨平台回归由三平台 CI 守护: Windows 平台回归失败被拦截 — ci.yml 中 windows-latest runner 执行 npm test 与 npm run smoke，任一失败导致工作流失败。

OK|开发态启动入口保持可用: macOS 首次启动生成改名副本 — dev.sh 在 Darwin 上复制 Electron.app 为 dist/WebDeck.app 并修改 CFBundleName、CFBundleDisplayName、CFBundleExecutable 为 WebDeck。

OK|开发态启动入口保持可用: Electron 版本升级后自动重建 — dev.sh 读取源 Electron 版本存入 MARKER，版本变化时重建副本。

OK|开发态启动入口保持可用: 非 macOS 平台回退 — dev.sh 在非 Darwin 平台直接 exec electron .，不生成副本。
```
