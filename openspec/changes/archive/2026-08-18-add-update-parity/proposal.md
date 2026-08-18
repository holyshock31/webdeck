# Proposal — add-update-parity

## Why

对照 Cherry Studio 最新源码（`docs/research/cherry-studio-update-deep-dive.md` + v2.0.7 `AppUpdaterService.ts` 逐行核对，见 .tmp-cherry-src）后，我们的更新服务在**防御正确性**上已对齐（调度/防双实例/关机保护/下载取消/事件落盘），但**体验层与工程设施**仍有一批差距，直接影响用户感知与可维护性：

1. **无系统通知**（Cherry `useAppUpdateHandler` L40-47）：后台自动检查发现新版只显示底部小提示条——窗口不聚焦时用户根本看不到，错过更新
2. **更新状态不持久**（Cherry `useAppUpdateState`）：下载完成未安装 → 重启后提示消失（下载白下）；无「忽略该版本」记忆 → 同一版本反复打扰
3. **无开关**（Cherry `app.dist.auto_update.enabled` L95/L362）：自动检查恒开启，用户无法关闭；调度循环也没有偏好门控
4. **开发态无法调试更新链路**（Cherry L94 `forceDevUpdateConfig` + `dev-app-update.yml`）：我们验证更新只能上真机/真发布——v0.1.11 发布时 CI 事故排查就是靠猜元数据，有 dev 调试设施本可本地复现
5. **electron-updater 内部日志未落盘**（Cherry L91 `autoUpdater.logger`）：差分下载回退、下载源 URL、staging 校验等内部日志拿不到，出问题仍要"靠猜"
6. **release notes 多语言处理粗暴**（Cherry L389-405 `processReleaseInfo` 按语言偏好本地化）：我们是 renderer 正则整体 strip `<!--LANG:xx-->` 标记，双语用户看到混排文本
7. **生命周期无清理**（Cherry L121/L143-171）：定时器与事件监听器常驻到进程退出，无 dispose

## What Changes

- `src/main/updater.js`：
  - 注入 `autoUpdater.logger`（info/warn/error/debug → logSink，`[updater]` 前缀）——electron-updater 内部日志（检查结果、下载 URL、差分回退、staging）全部落盘 `userData/logs/webdeck.log`
  - `autoUpdater.forceDevUpdateConfig = !app.isPackaged`（构造时设置，不依赖 start()）——开发态读取仓库根 `dev-app-update.yml`，手动检查即可走完整链路
  - 系统通知：`update-available` / `update-downloaded` 时 `new Notification`（`Notification.isSupported()` 守卫；点击聚焦主窗口）
  - `processReleaseInfo` 等价物：广播前用 `localizeReleaseNotes(info.releaseNotes, app.getLocale())` 本地化（纯函数在 updater-policy.js）
  - 偏好开关：`autoUpdater.autoDownload` 由 `settings.autoUpdateEnabled`（默认 true）驱动；调度循环每 tick 门控（关闭时空转、不取消后续排程，与 Cherry L362 一致）；手动检查不受开关限制
  - `dispose()`：clearTimeout + 摘除全部 autoUpdater 监听器；`app.on('will-quit')` 调用
- `src/main/updater-policy.js`：新增纯函数 `localizeReleaseNotes(notes, language)`——解析 `<!--LANG:xx-->…<!--LANG:END-->` 块，按语言（大小写不敏感、前缀匹配，zh-CN → zh）选择，回退 `en` → 无标记原文（strip 后）
- `src/main/index.js`：帮助菜单新增「自动检查更新」checkbox（读/写 `settings.autoUpdateEnabled`，切换即生效并重建菜单）；`createUpdater` 注入 `getAutoUpdateEnabled` / `setAutoUpdateEnabled`；`will-quit` 时 `updater.dispose()`
- 仓库根新增 `dev-app-update.yml`：`provider: generic` + `url: http://127.0.0.1:8123`（本地更新调试服务器地址，README 说明用法）
- `src/renderer/app.js`：更新状态持久化——localStorage `webdeck.updateState`（`{ ignoredVersion, downloadedVersion }`）；启动时若有 `downloadedVersion` 直接显示「新版本已就绪，可立即安装」提示条；`available` 事件版本 == `ignoredVersion` 时跳过提示；更新弹窗新增「忽略此版本」按钮（点击 → 记录忽略 + 收起提示/弹窗）；releaseNotes 直接显示主进程已本地化的内容（删除 regex strip）
- `scripts/test-core.js`：新增 `localizeReleaseNotes` 单测组（zh 命中/en 回退/无标记原文/未知语言回退）
- 文档：README 更新机制章节补充（系统通知、状态持久化与忽略版本、开关位置、开发态调试方法、多语言 release notes）；`docs/research/cherry-studio-update-deep-dive.md` 差距表更新（已实现项标注移除）

## Impact

- **运行时行为**：发现新版/下载完成多两条系统通知（可关，`isSupported` 守卫）；下载完成未安装重启后提示保留；忽略版本后不再打扰；帮助菜单可关闭自动检查；日志信息量增加（内部日志，排查更快）；其余不变
- **兼容性**：零 schema/IPC 破坏（`settings.autoUpdateEnabled` 为可选新增字段，缺失默认 true）；renderer 行为向后兼容（持久化状态缺失时按现状处理）
- **风险**：低——通知/持久化/开关均为增量；`forceDevUpdateConfig` 仅开发态生效（打包态行为不变）；`autoUpdater.logger` 注入在打包态也生效（日志量增加，已有 1MB 轮转兜底）
- **范围边界**（明确不做，理由见调研文档）：rc/beta 通道与 test_plan、区域分流（cn/global）与 X-Region 请求头、release-history.json、analytics——均需 Cherry 的 CDN/服务器基础设施，GitHub 直连架构不适用；`disableDifferentialDownload` 不采纳（GitHub 直连保留差分省流量）；服务级 mock 测试基建（仓库无此基建，纯函数测试覆盖核心逻辑）；验收方式为 `npm test` + `npm run smoke` + 真机清单（系统通知、重启后提示保留、忽略版本、开关、开发态本地更新服务器联调、日志内部行）

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
