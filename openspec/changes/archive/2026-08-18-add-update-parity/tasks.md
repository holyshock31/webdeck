# Tasks — add-update-parity

- [x] src/main/updater.js：注入 `autoUpdater.logger`（info/warn/error/debug → logSink，`[updater]` 前缀）——electron-updater 内部日志（检查结果/下载 URL/差分回退/staging）落盘 webdeck.log
- [x] src/main/updater.js：`autoUpdater.forceDevUpdateConfig = !app.isPackaged`（构造时设置，不依赖 start()）；仓库根新增 `dev-app-update.yml`（generic provider → http://127.0.0.1:8123）——开发态手动检查走完整更新链路
- [x] src/main/updater.js：系统通知——`update-available` / `update-downloaded` 时 `new Notification`（`Notification.isSupported()` 守卫，点击聚焦主窗口）
- [x] src/main/updater-policy.js：新增纯函数 `localizeReleaseNotes(notes, language)`（`<!--LANG:xx-->…<!--LANG:END-->` 块按语言前缀匹配 → en 回退 → 无标记原文）；updater.js 广播 available/downloaded 前调用（`app.getLocale()`）
- [x] src/main/updater.js：偏好开关——`autoUpdater.autoDownload` 由 `settings.autoUpdateEnabled`（默认 true）驱动；调度循环每 tick 门控（关闭时空转、排程不取消，与 Cherry L362 一致）；手动检查不受开关限制
- [x] src/main/updater.js：`dispose()`（clearTimeout + 摘除全部 autoUpdater 监听器）；src/main/index.js `will-quit` 时调用
- [x] src/main/index.js：帮助菜单「自动检查更新」checkbox（读/写 `settings.autoUpdateEnabled`，切换即生效并重建菜单）；`createUpdater` 注入 `getAutoUpdateEnabled` / `setAutoUpdateEnabled`
- [x] src/renderer/app.js：更新状态持久化——localStorage `webdeck.updateState`（`{ ignoredVersion, downloadedVersion }`）；启动时 `downloadedVersion` 存在 → 直接显示「已就绪可安装」提示条；`available` 版本 == `ignoredVersion` → 跳过提示；更新弹窗新增「忽略此版本」按钮（记录忽略 + 收起提示/弹窗）
- [x] src/renderer/app.js：releaseNotes 直接显示主进程已本地化的内容（删除 `<!--LANG:-->` regex strip）
- [x] 测试：scripts/test-core.js 新增 `localizeReleaseNotes` 单测组（zh 命中/en 回退/无标记原文/未知语言回退）；npm test 与 npm run smoke 全绿
- [x] README.md：更新机制章节补充（系统通知、状态持久化与忽略版本、帮助菜单开关、开发态调试 dev-app-update.yml 方法、多语言 release notes）；docs/research/cherry-studio-update-deep-dive.md 差距表更新（已实现项标注）
- [ ] 真机手动验证：打包版发现新版/下载完成收到系统通知（点击聚焦窗口）；下载完成未安装重启后提示保留；「忽略此版本」后不再提示（重启后亦然）；帮助菜单关闭自动检查后不再自动检查（手动检查仍可用）、重新开启恢复；开发态 dev-app-update.yml + 本地静态服务器手动检查可发现并下载；webdeck.log 出现 electron-updater 内部日志行（如 "Downloading update from ..."）
