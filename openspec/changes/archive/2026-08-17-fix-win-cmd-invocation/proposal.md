# Proposal — fix-win-cmd-invocation

## Why

v0.1.6（fix-win-cmd-exec）修复 argv 序列化转义后，Windows 真机链路日志显示 cmd 收到的是**正确语法**（`"C:\Program Files\nodejs\dsh.cmd" --profile web`，无 `\"`），但仍失败：

```
[spawn] argv=/d /s /c "C:\Program Files\nodejs\dsh.cmd" --profile web
'C:\Program' is not recognized as an internal or external command
[exit] code=1 存活=104ms
```

这是 cmd.exe 的**第二层坑**——`cmd /S` 的剥首引号规则（`cmd /?` 文档）：

> `/C` 后整条以引号开头时，**剥掉第一个引号**（`/S` 时仅剥第一个），去掉最后一个引号，保留其后文本

`/d /s /c "C:\Program Files\nodejs\dsh.cmd" --profile web` 首字符是引号 → cmd 剥掉首引号 → 路径失去引号保护 → 命令名按空格拆为 `C:\Program` → 报错。verbatim 修复已生效（引号未被转义），但单层引号扛不住 cmd 的剥引号。

`child_process.exec` 与 npm 的 cmd-shim 都采用**双层引号**规避此规则：

```
cmd /d /s /c ""C:\Program Files\nodejs\dsh.cmd" --profile web"
```

cmd 剥掉**外层**首尾引号 → 内层 `"C:\...\dsh.cmd"` 完整保留 → 正确执行。

## What Changes

- `src/main/process-manager.js`：win32 `.cmd/.bat` 分支的 argv 末元素改为**外层引号包裹**——`spawn(cmd, ['/d','/s','/c', '"' + winCmdLine(resolved.path, args) + '"'], winCmdSpawnOptions(base))`；cmd 剥外层引号后内层引号完整保留，路径与含空格参数不受 `C:\Program` 式拆分；`windowsVerbatimArguments: true` 保持（两层引号均原样传递）
- 新增纯函数 `winCmdInvocationArgs(path, args)`（返回 `['/d','/s','/c', '"'+winCmdLine(path,args)+'"']`）便于单测；`.exe` / POSIX / Shell 分支不变
- 测试：`scripts/test-core.js` 补充断言——winCmdInvocationArgs 双层引号形态（含空格路径、带参数、含内部引号）
- 文档：README 常见问题「Windows 直接命令 is not recognized」条目更新为完整成因链（argv 转义 → cmd 剥首引号，双层引号解决）

## Impact

- **运行时行为**：仅 win32 `.cmd/.bat` 分支的 argv 构造变化（外层引号包裹）——解析、verbatim、`.exe`、POSIX、Shell 分支零变化；修复后 cmd 分支命令可正常执行
- **兼容性**：无持久化 schema、无 IPC 变化；链路日志 `[spawn]` 行如实展示双层引号形态（argv 以 `""C:\...\dsh.cmd" --profile web"` 呈现），诊断语义不变
- **风险**：低——双层引号是 exec/cmd-shim 的成熟标准做法；cmd 特殊字符（`%`/`^`/`&`）转义行为不变（winCmdLine 内部逻辑未动）
- **范围边界**：不改 Shell 命令模式（用户手写命令行的引号处理是用户责任，且走同一 spawn 路径但命令行由用户控制）；验收方式为手动验证（Windows 真机 `dsh --profile web` 直接命令启动成功）

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
