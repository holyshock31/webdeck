# Proposal — harden-update-service

## Why

源码对照 Cherry Studio 的 AppUpdaterService（docs/research/cherry-studio-update-deep-dive.md）后，我们的更新服务抄对了调度骨架与防御哲学，但缺 Cherry 从真实事故中总结的四个工程补丁：

1. **Windows 自定义安装目录对齐缺失**（Cherry L104 `installDirectory = path.dirname(app.getPath('exe'))`）：我们 NSIS 开了 `allowToChangeInstallationDirectory: true`，用户自定义安装路径后，electron-updater 默认按固定安装目录执行增量更新 → **更新装回默认目录 → 双实例**（旧版还在跑、新版装别处）
2. **关机保护缺失**（Cherry L125-127 关机时 `autoDownload = false`）：关机途中下载 → 半成品文件 → 下次启动更新损坏
3. **更新日志未接入落盘**（Cherry L91 `autoUpdater.logger`）：更新错误只 IPC 广播 + alert，`webdeck.log` 无记录——排查重新陷入"靠猜"（我们刚用日志链解决过 Windows 启动问题，却漏了 updater）
4. **下载无法取消**（Cherry L278-284 `CancellationToken` + `cancelDownload()`）：下载卡住/误触发时用户无法中止

## What Changes

- `src/main/updater.js`：
  - Windows 打包态设置 `(autoUpdater as NsisUpdater).installDirectory = path.dirname(app.getPath('exe'))`——更新安装目录对齐当前 exe（防双实例）
  - `powerMonitor.on('shutdown')` 与 `app.on('before-quit')` 时 `autoUpdater.autoDownload = false`（关机/退出保护）
  - 注入 `logSink`（复用 createProcessManager 的 fileLog 通道）：检查结果、错误、下载、安装等更新事件写入 `userData/logs/webdeck.log`
  - 下载取消：`CancellationToken` 贯穿 `downloadUpdate`，新增 `cancelDownload()` 与 IPC `updater:cancel`
- `src/preload/preload.cjs` + `src/renderer/app.js`：下载中提示条增加「取消」按钮（经 IPC 调 cancelDownload）
- `src/main/index.js`：createUpdater 注入 logSink
- 测试：补可单测的纯逻辑（如有）；回归 npm test / npm run smoke
- 文档：README 更新机制补充（自定义安装目录支持、关机保护、日志位置、下载取消）

## Impact

- **运行时行为**：Windows 自定义安装目录用户更新装到当前目录（修复双实例隐患）；关机时停止下载；更新事件落盘可查；下载可取消
- **兼容性**：无 schema/IPC 破坏（新增 updater:cancel 通道）；安装目录对齐仅打包态生效（开发态 app.getPath('exe') 为 electron 二进制，跳过）
- **风险**：低——四项均为防御性补丁，行为在现有链路内增强；installDirectory 需 Windows 真机验证（自定义安装目录升级）
- **范围边界**：不做状态持久化/系统通知/偏好开关/rc 通道（体验层另立变更）；验收方式为手动验证（Windows 自定义目录升级、取消下载、webdeck.log 查更新记录）

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
