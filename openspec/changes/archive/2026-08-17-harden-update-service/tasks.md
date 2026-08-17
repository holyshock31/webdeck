# Tasks — harden-update-service

- [x] src/main/updater.js：Windows 打包态设置 `NsisUpdater.installDirectory = path.dirname(app.getPath('exe'))`（更新装到当前 exe 目录，防自定义安装目录双实例）；开发态跳过
- [x] src/main/updater.js：`powerMonitor.on('shutdown')` 与 `app.on('before-quit')` 时 `autoUpdater.autoDownload = false`（关机/退出保护，防半成品下载）
- [x] src/main/updater.js：注入 logSink——检查结果/错误/下载/安装事件写入 webdeck.log；src/main/index.js 接入 fileLog
- [x] src/main/updater.js：`CancellationToken` 贯穿下载 + `cancelDownload()` + IPC `updater:cancel`
- [x] src/preload/preload.cjs + src/renderer/app.js：下载中提示条增加「取消」按钮
- [x] 测试：npm test 与 npm run smoke 全绿（含既有测试 11 调度纯函数）
- [x] README.md：更新机制补充（自定义安装目录支持、关机保护、更新日志在 webdeck.log、下载可取消）
- [ ] 真机手动验证：Windows 自定义安装目录升级成功（无双实例）；下载中取消生效；webdeck.log 含更新事件记录
