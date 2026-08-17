# Proposal — fix-win-cmd-exec

## Why

v0.1.5 的启动链路日志在 Windows 真机首次实战即锁定根因（此前只能猜测）：

```
[spawn] argv=/d /s /c "C:\Program Files\nodejs\dsh.cmd" --profile web
'\"C:\Program Files\nodejs\dsh.cmd\"' is not recognized as an internal or external command
[exit] code=1 存活=88ms
```

- `winCmdLine()` 生成的命令行语法本身正确（`"C:\Program Files\nodejs\dsh.cmd" --profile web`，cmd 认得）
- 但该字符串作为**单个 argv 元素**传给 `spawn(cmd, ['/d','/s','/c', 整串])` 后，Node/libuv 在 Windows 上序列化 argv 时按 C 运行时规则把 `"` 转义为 `\"`（**不是 cmd 规则**）
- cmd 不认反斜杠转义 → 把 `\"C:\Program` 当作命令名 → `is not recognized` → code=1 退出

次要问题：日志面板顶部「进程已退出 (code=1, 存活 8743ms)」与链路 `[exit]` 行（88ms）不一致——存活时长是面板打开时**实时计算**（`Date.now() - startTime`），tombstone 保留越久数字越虚，应在退出时冻结。

## What Changes

- `src/main/process-manager.js`：win32 `.cmd/.bat` 分支的 spawn 增加 **`windowsVerbatimArguments: true`**——argv 不再被 Node 序列化转义，整串命令行原样进入 CreateProcess，cmd 收到原始 `"C:\Program Files\nodejs\dsh.cmd" --profile web` 语法并正确执行（与 `child_process.exec` 内部机制一致，npm cmd-shim 的标准调用路径）；`.exe` 分支与 POSIX 分支不变（无此问题）
- `src/main/process-manager.js`：exit 处理记录 **`exitUptimeMs`**（退出时冻结的存活时长），`[exit]` 链节与 `app:logs` 返回的退出信息均使用冻结值；渲染层显示不再虚增
- 测试：`scripts/test-core.js` 补充断言——win32 cmd 分支 spawn 参数含 `windowsVerbatimArguments: true`（通过 base 构造纯函数化验证或参数断言）、`exitUptimeMs` 冻结（退出后延迟读取值不变）
- 文档：README 常见问题更新「Windows 直接命令 ENOENT/is not recognized」条目（含 windowsVerbatimArguments 修复说明）

## Impact

- **运行时行为**：仅 win32 `.cmd/.bat` 分支的 spawn 参数变化（加 verbatim 标志）与退出信息字段补充——解析逻辑、POSIX、Shell 模式、`.exe` 分支零变化；修复后 cmd 分支命令可正常执行
- **兼容性**：无持久化 schema、无 IPC 协议变化（`app:logs` 返回值新增/替换字段，渲染层同步读取）；链路日志格式不变
- **风险**：低——verbatim 模式要求调用方自行拼好命令行（winCmdLine 已按 cmd 规则转义）；cmd 特殊字符（`%`/`^`/`&`）的既有转义行为不变
- **范围边界**：不做 Shell 命令模式改动（其命令行由用户手写、走同一 spawn 路径——一并受益于 verbatim？**不改**，Shell 模式保持现状，避免引入新变量）；验收方式为手动验证（Windows 真机 `dsh --profile web` 直接命令启动成功）

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
