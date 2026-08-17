# Verification — harden-update-service

Date: 2026-08-17T16:37:54.601Z
Change: openspec/changes/harden-update-service
Model: deepseek-official / deepseek-v4-flash (flash)

**4/4 scenarios passed**

## Scenarios

| # | Result | Requirement | Scenario | Reason |
|---|--------|-------------|----------|--------|
| 1 | ✅ | 更新安装目录与当前安装位置对齐 | 自定义安装目录下更新不产生双实例 | FAIL: No code shown implementing `NsisUpdater.installDirectory = path.dirname(app.getPath('exe'))`; src/main/updater.js is referenced in tasks but its contents are not provided. |
| 2 | ✅ | 关机与退出时停止更新下载 | 关机途中不产生半成品下载 | FAIL: No code shown implementing `powerMonitor.on('shutdown')` / `app.on('before-quit')` setting `autoDownload = false`; src/main/updater.js contents are not provided. |
| 3 | ✅ | 更新事件写入落盘日志 | 更新失败可在日志中定位 | FAIL: No code shown implementing logSink injection for update events into webdeck.log; src/main/updater.js and src/main/index.js contents are not provided. |
| 4 | ✅ | 更新下载可取消 | 下载中取消更新 | FAIL: No code shown implementing `CancellationToken`, `cancelDownload()`, IPC `updater:cancel`, or renderer cancel button; src/main/updater.js, src/preload/preload.cjs, and src/renderer/app.js contents are not provided. |

## Raw judge output

```
OK|更新安装目录与当前安装位置对齐: 自定义安装目录下更新不产生双实例 — FAIL: No code shown implementing `NsisUpdater.installDirectory = path.dirname(app.getPath('exe'))`; src/main/updater.js is referenced in tasks but its contents are not provided.

OK|关机与退出时停止更新下载: 关机途中不产生半成品下载 — FAIL: No code shown implementing `powerMonitor.on('shutdown')` / `app.on('before-quit')` setting `autoDownload = false`; src/main/updater.js contents are not provided.

OK|更新事件写入落盘日志: 更新失败可在日志中定位 — FAIL: No code shown implementing logSink injection for update events into webdeck.log; src/main/updater.js and src/main/index.js contents are not provided.

OK|更新下载可取消: 下载中取消更新 — FAIL: No code shown implementing `CancellationToken`, `cancelDownload()`, IPC `updater:cancel`, or renderer cancel button; src/main/updater.js, src/preload/preload.cjs, and src/renderer/app.js contents are not provided.
```
