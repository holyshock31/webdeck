# Proposal — add-launch-log-chain

## Why

Windows 真机定位「直接命令启动失败」的过程中，现有诊断手段暴露三个断层，导致每次都要靠反复猜测与零侵入实验：

- **退出即丢**：`child.on('exit')` 中 `procs.delete(app.id)` 把 logLines 一起删除——进程一旦退出（无论退出码），日志面板查无此据。v0.1.4 实测中「日志面板没内容」恰恰说明进程**启动过又退出了**（未走 spawn 失败 tombstone 分支），但执行层证据全部丢失
- **诊断只有 spawn error 一个节点**：解析成功后的执行层（cmd 转义、退出码、存活时长）零留痕——v0.1.4 的 `.cmd` 经 cmd.exe 执行怀疑 Node argv 二次转义与 `cmd /s` 剥引号冲突，但没有 `spawnargs` 真实命令行的证据，只能推断
- **打包版 GUI 启动无终端**：主进程日志只进 console，GUI 用户唯一窗口就是那个会丢数据的日志面板——`[boot]`/`[spawn error]` 等全部不可见

## What Changes

- `src/main/process-manager.js`：launch 增加**链路日志**——每次启动本地进程按固定链节留痕（写日志面板与落盘）：
  - `[launch]` 触发来源（手动/自动）、配置原文（模式/命令/参数/cwd）
  - `[env]` PATH 来源（继承/注册表兜底/补全）与最终值摘要
  - `[resolve]` win32 直接命令解析结果（命中路径/类型/候选序号，或未命中尝试列表）
  - `[spawn]` exec、argv、**`child.spawnargs` 序列化后的真实命令行全文**（cmd 转义冲突的直接证据）
  - `[exit]` 退出码、信号、存活时长
  - `[judge]` 状态机判定结果与原因（error/stopped/running 及 detail）
- `src/main/process-manager.js`：**退出后保留日志**——进程退出后 logLines 与退出信息（code/signal/存活时长）保留为 tombstone，日志面板显示「进程已退出 (code=N, 存活 Xs)」；下次 launch 替换、stop 或删除应用时清除
- `src/main/index.js`：新增**落盘日志模块**——主进程日志（含链路行）追加写入 `userData/logs/webdeck.log`，按大小轮转（1MB，保留最近 3 份），打包版 GUI 启动也可查看全量链路
- `src/renderer/app.js`：日志面板渲染退出状态行（基于 tombstone 的 exitCode/signal），空白面板变为「进程已退出 + 原因」
- 测试：`scripts/test-core.js` 补充单测——退出后 tombstone 保留（logLines/exitCode 可读）、下次 launch/stop 清除、轮转逻辑纯函数
- 文档：README 与 docs 记录日志查看指引（面板 + `userData/logs/webdeck.log` 位置）

## Impact

- **运行时行为**：纯诊断增强——launch/exit 路径增加日志写入与 tombstone 保留，不改变 spawn 参数、终止策略、状态机判定；日志面板行为从「退出后空白」变为「显示退出信息」
- **存储**：新增 `userData/logs/` 目录（1MB 轮转 × 3），可控；日志文件不进 git（userData 在用户目录）
- **模块边界**：process-manager 维持纯 Node 可单测；轮转逻辑为纯函数；落盘模块在主进程侧
- **兼容性**：无持久化 schema、无 IPC 协议变化、无 UI 布局变化；现有 tombstone 语义（spawnError）不变，新增「退出 tombstone」与之并存（exitCode 非空 vs spawnError 非空）
- **风险**：低——日志写入为异步追加，不阻塞主流程；轮转阈值下日志量可控
- **范围边界**：不做日志级别过滤 UI、不做日志导出、不做自动上报；验收方式为手动验证（Windows 真机看链路 + 落盘文件）

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
