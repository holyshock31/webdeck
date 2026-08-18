# Cherry Studio 自动更新源码级深度对照（WebDeck 差距分析）

> 基线：CherryHQ/cherry-studio main 分支源码（本次重新拉取逐行阅读，非二手报告）。
> 相关文件：`src/main/services/AppUpdaterService.ts`（406 行）、`src/renderer/windows/main/hooks/useAppUpdateHandler.ts`、`src/renderer/components/UpdateDialogPopup.tsx`、`src/renderer/hooks/useAppUpdateState.ts`、`electron-builder.yml`、`.github/workflows/release.yml`、`build/nsis-installer.nsh`。
> 配套文档：[cherry-studio-update.md](./cherry-studio-update.md)（初版方案调研）；本文是逐行源码对照后的差距深化。

## 一、发布侧差距（最紧急——v0.1.10 事故直接根因）

### 1.1 Cherry 的 draft 发布机制（release.yml L155-166）

```yaml
- name: Release
  uses: ncipollo/release-action@v1
  with:
    draft: true          # 全部资产先进草稿
    allowUpdates: true   # 后续 job 可更新草稿资产
    makeLatest: false    # 不自动标记 Latest
    artifacts: "dist/*.exe,...,dist/latest*.yml,dist/rc*.yml,dist/beta*.yml,dist/*.blockmap,..."
```

**语义**：三平台资产全部上传进 **draft release**，人工在 GitHub UI 点 "Publish release" 才对外可见；`makeLatest: false` 防误标。半成品版本（某平台 job 失败）永远不会被客户端自动发现。

### 1.2 我们的现状与事故复盘

- softprops 直接发布（无 draft）——三平台 job 独立完成即对外可见
- **v0.1.10 事故链**：Windows job 因 GitHub 基础设施故障（下载 action 503/429）失败 → release 已可见 → 客户端按 latest-mac.yml 下载 → 404
- 另一半根因：mac 资产构建后 `mv` 重命名加 `-unsigned`，latest-mac.yml 的 url 与资产名不一致（已由 fix-update-metadata 修复）

### 1.3 Cherry 的 artifactName 显式化（electron-builder.yml L91-119）

`win` / `nsis` / `mac` 三处均显式 `${productName}-${version}-${arch}-setup.${ext}` 等——元数据与文件名同源。我们 v0.1.11 起补齐。

## 二、主进程服务差距（AppUpdaterService.ts 逐行对照）

| # | 源码位置 | Cherry 做法 | WebDeck 现状 | 差距影响 |
|---|---|---|---|---|
| 1 | L104 | `(autoUpdater as NsisUpdater).installDirectory = application.getPath('app.install')`——更新安装目录对齐 exe 所在目录 | ✅ 已实现（harden-update-service）：打包态对齐 `path.dirname(app.getPath('exe'))` | 已消除：自定义安装目录不再产生双实例 |
| 2 | L125-127 | `PowerService.registerShutdownHandler(() => { autoUpdater.autoDownload = false })` | ✅ 已实现（harden-update-service）：`powerMonitor shutdown` + `before-quit` → `autoDownload=false` **并取消在途下载**（比 Cherry 更进一步） | 已消除 |
| 3 | L91 | `autoUpdater.logger = logger as Logger`（接入中央日志） | ✅ 已实现（harden-update-service 事件级 + add-update-parity 内部 logger 注入）：electron-updater 内部日志与事件全部落盘 webdeck.log | 已消除 |
| 4 | L278-284 | `CancellationToken` 贯穿 + `cancelDownload()`（切换通道时主动取消） | ✅ 已实现（harden-update-service）：捕获 checkForUpdates 结果 token + `cancelDownload()` + IPC/UI | 已消除 |
| 5 | L94 | `forceDevUpdateConfig = !app.isPackaged` + `dev-app-update.yml`（本地静态服务器调试更新） | ✅ 已实现（add-update-parity）：构造时 `forceDevUpdateConfig = !app.isPackaged` + 仓库根 `dev-app-update.yml`（generic → 127.0.0.1:8123） | 已消除：开发态可本地调试更新链路 |
| 6 | L121 | 服务 stop 时 `SchedulerService.unregister`（生命周期清理） | ✅ 已实现（add-update-parity）：`dispose()` 清定时器 + 摘监听器，`will-quit` 调用 | 已消除（影响小） |
| 7 | L379-382 | `quitAndInstall` 前 `application.markQuitting()` | ⚠️ 直接 quitAndInstall | 退出流程标记缺失（影响小；无 quit 状态机基建） |
| 8 | L389-405 | `processReleaseInfo`：多语言 release notes（`<!--LANG:en-->` 标记 + 按偏好语言裁剪） | ✅ 已实现（add-update-parity）：`localizeReleaseNotes` 纯函数按 `app.getLocale()` 本地化，主进程广播前处理 | 已消除 |
| 9 | L362 | 每 tick 偏好门控（`app.dist.auto_update.enabled` 用户开关） | ✅ 已实现（add-update-parity）：`settings.autoUpdateEnabled`（默认开）+ 帮助菜单 checkbox + 调度每 tick 门控（手动检查不受限） | 已消除 |
| 10 | L174-207 | `requestHeaders`（UA/Client-Id/App-Name/App-Version/OS/X-Region）+ channel（latest/rc/beta）+ `disableDifferentialDownload=true` | ⚠️ 无请求头、差分开着 | 请求头利于统计诊断（GitHub 直连收益低，Cherry 为自家 CDN 设计）；差分在 GitHub 直连下保留（省流量），不采纳关闭 |

## 三、渲染层差距

| 源码位置 | Cherry 做法 | WebDeck 现状 | 影响 |
|---|---|---|---|
| useAppUpdateHandler L40-47 | 发现新版发**系统通知** | ✅ 已实现（add-update-parity）：available/downloaded 发系统通知，点击聚焦窗口 | 已消除 |
| useAppUpdateState.ts | `useCache('app.dist.update_state')` **跨窗口/重启持久化**（checking/downloading/downloaded/available/ignore/manualCheck） | ✅ 已实现（add-update-parity）：localStorage `webdeck.updateState`（downloadedVersion/ignoredVersion）——下载完成未安装重启后提示保留 | 已消除（状态集为精简版：忽略版本 + 已下载版本） |
| UpdateDialogPopup onIgnore | `ignore: true` 状态机记住"稍后" | ✅ 已实现（add-update-parity）：弹窗「忽略此版本」持久化，该版本不再提示（可重新检查下载） | 已消除 |
| useAppUpdateHandler L83-89 | error 时全量重置状态（checking/downloading/progress/manualCheck） | ⚠️ 仅重置 manualCheck 与取消按钮 | 状态机仍不严谨（影响小，error 后 banner 残留旧文本） |
| UpdateDialogPopup 动态 import | 弹窗动态加载（markdown 栈 ~0.84MB 不拖首屏） | 无 markdown 渲染，无此负担 | 不适用，不抄 |

## 四、NSIS 定制（nsis-installer.nsh）

Cherry：架构匹配检查（系统/应用架构比对）+ VC++ 运行库检测。WebDeck 无原生依赖（VC++ 不需要）；架构检查低优先。

## 五、WebDeck 补齐路线（按优先级）

1. ✅ **fix-release-draft**（发布侧）：softprops 加 `draft: true` + `makeLatest: false` + 发布流程文档（人工 Publish）——防半成品被客户端发现（v0.1.11 起生效）
2. ✅ **harden-update-service**（服务层）：installDirectory 对齐 + 关机保护 + updater 日志接入 webdeck.log + 下载取消（CancellationToken + IPC + UI）（v0.1.11）
3. ✅ **add-update-parity**（体验层）：系统通知、状态持久化 + 忽略版本、auto_update 开关、dev-app-update.yml 调试、内部 logger 落盘、多语言 release notes、dispose 清理
4. 产品化能力（明确不做）：rc/beta 通道、区域分流、release-history 页、自建 CDN

## 六、已对齐项（骨架正确）

主进程调度（首查延迟/周期抖动/失败退避）、`autoInstallOnAppQuit=false`、`allowDowngrade=false`、Windows `verifyUpdateCodeSignature=false`、portable 跳过、manualCheck 区分自动/手动提示、调度策略纯函数单测（updater-policy.js + 测试 11/11b/11c）。
