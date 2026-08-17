# Verification — fix-win-cmd-invocation

Date: 2026-08-17T09:38:41.994Z
Change: openspec/changes/fix-win-cmd-invocation
Model: deepseek-official / deepseek-v4-flash (flash)

**5/5 scenarios passed**

## Scenarios

| # | Result | Requirement | Scenario | Reason |
|---|--------|-------------|----------|--------|
| 1 | ✅ | Windows 直接命令模式的可执行文件解析 | Windows 上 npm 全局工具可直接命令启动 | winCmdInvocationArgs 实现双层引号包裹，resolveWinCommand 跳过无扩展名 shim 命中 .cmd |
| 2 | ✅ | Windows 直接命令模式的可执行文件解析 | Windows 上 .exe 应用直接执行 | resolveWinCommand 对 .exe/.com 返回 type='exe'，走 spawn(resolved.path, args, base) 不经 cmd.exe |
| 3 | ✅ | Windows 直接命令模式的可执行文件解析 | Windows 上 .cmd 应用可启动 | .cmd 分支使用 winCmdInvocationArgs 构造 '/d','/s','/c','"..."' 双层引号命令行，windowsVerbatimArguments: true |
| 4 | ✅ | Windows 直接命令模式的可执行文件解析 | 命令未命中时报错并给出解析过程 | resolveWinCommand 返回 notfound 状态及 attempts 列表，日志记录"解析过程: 按 PATH+PATHEXT 尝试 N 个候选" |
| 5 | ✅ | Windows 直接命令模式的可执行文件解析 | macOS 直接命令行为不变 | 非 win32 分支直接 spawn(opts.command, args, base)，未走 Windows 解析逻辑 |

## Raw judge output

```
OK|Windows 直接命令模式的可执行文件解析: Windows 上 npm 全局工具可直接命令启动 — winCmdInvocationArgs 实现双层引号包裹，resolveWinCommand 跳过无扩展名 shim 命中 .cmd
OK|Windows 直接命令模式的可执行文件解析: Windows 上 .exe 应用直接执行 — resolveWinCommand 对 .exe/.com 返回 type='exe'，走 spawn(resolved.path, args, base) 不经 cmd.exe
OK|Windows 直接命令模式的可执行文件解析: Windows 上 .cmd 应用可启动 — .cmd 分支使用 winCmdInvocationArgs 构造 '/d','/s','/c','"..."' 双层引号命令行，windowsVerbatimArguments: true
OK|Windows 直接命令模式的可执行文件解析: 命令未命中时报错并给出解析过程 — resolveWinCommand 返回 notfound 状态及 attempts 列表，日志记录"解析过程: 按 PATH+PATHEXT 尝试 N 个候选"
OK|Windows 直接命令模式的可执行文件解析: macOS 直接命令行为不变 — 非 win32 分支直接 spawn(opts.command, args, base)，未走 Windows 解析逻辑
```
