# Verification — fix-win-cmd-exec

Date: 2026-08-17T08:27:13.269Z
Change: openspec/changes/fix-win-cmd-exec
Model: deepseek-official / deepseek-v4-flash (flash)

**9/9 scenarios passed**

## Scenarios

| # | Result | Requirement | Scenario | Reason |
|---|--------|-------------|----------|--------|
| 1 | ✅ | Windows 直接命令模式的可执行文件解析 | Windows 上 npm 全局工具可直接命令启动 | resolveWinCommand skips extension-less shim, resolves dsh.cmd, spawns via cmd.exe with windowsVerbatimArguments. |
| 2 | ✅ | Windows 直接命令模式的可执行文件解析 | Windows 上 .exe 应用直接执行 | resolveWinCommand returns type 'exe', spawns directly with base options (no cmd.exe wrapper). |
| 3 | ✅ | Windows 直接命令模式的可执行文件解析 | Windows 上 .cmd 应用可启动 | .cmd/.bat resolved via cmd.exe with winCmdSpawnOptions including windowsVerbatimArguments: true. |
| 4 | ✅ | Windows 直接命令模式的可执行文件解析 | 命令未命中时报错并给出解析过程 | resolveWinCommand returns notfound with attempts array; logSpawnError records PATH snippet and candidate attempts. |
| 5 | ✅ | Windows 直接命令模式的可执行文件解析 | macOS 直接命令行为不变 | POSIX branch spawns command directly, unchanged behavior. |
| 6 | ✅ | 本地进程退出后日志保留 | 启动后立即退出的进程日志仍可见 | exit handler keeps tombstone with logLines and exit info; renderer shows exit line. |
| 7 | ✅ | 本地进程退出后日志保留 | 退出状态行的存活时长不虚增 | exitUptimeMs frozen at exit time; app:logs returns uptimeMs from frozen value. |
| 8 | ✅ | 本地进程退出后日志保留 | 重新启动后日志刷新 | launch replaces tombstone with new instance, old logLines replaced. |
| 9 | ✅ | 本地进程退出后日志保留 | 停止应用清除退出日志 | stop() deletes tombstone when exitCode/signal set, clearing exit info. |

## Raw judge output

```
OK|Windows 直接命令模式的可执行文件解析: Windows 上 npm 全局工具可直接命令启动 — resolveWinCommand skips extension-less shim, resolves dsh.cmd, spawns via cmd.exe with windowsVerbatimArguments.

OK|Windows 直接命令模式的可执行文件解析: Windows 上 .exe 应用直接执行 — resolveWinCommand returns type 'exe', spawns directly with base options (no cmd.exe wrapper).

OK|Windows 直接命令模式的可执行文件解析: Windows 上 .cmd 应用可启动 — .cmd/.bat resolved via cmd.exe with winCmdSpawnOptions including windowsVerbatimArguments: true.

OK|Windows 直接命令模式的可执行文件解析: 命令未命中时报错并给出解析过程 — resolveWinCommand returns notfound with attempts array; logSpawnError records PATH snippet and candidate attempts.

OK|Windows 直接命令模式的可执行文件解析: macOS 直接命令行为不变 — POSIX branch spawns command directly, unchanged behavior.

OK|本地进程退出后日志保留: 启动后立即退出的进程日志仍可见 — exit handler keeps tombstone with logLines and exit info; renderer shows exit line.

OK|本地进程退出后日志保留: 退出状态行的存活时长不虚增 — exitUptimeMs frozen at exit time; app:logs returns uptimeMs from frozen value.

OK|本地进程退出后日志保留: 重新启动后日志刷新 — launch replaces tombstone with new instance, old logLines replaced.

OK|本地进程退出后日志保留: 停止应用清除退出日志 — stop() deletes tombstone when exitCode/signal set, clearing exit info.
```
