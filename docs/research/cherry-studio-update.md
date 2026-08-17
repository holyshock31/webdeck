# Cherry Studio 自动升级（Auto-Update）实现方案调研报告

> 调研对象：[CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio)（基于 LLM 的跨平台 Electron 桌面客户端）
> 调研基线：commit `6e66e8226cabd235c6d43d6fc3278333d8fd8586`（2026-08-17，main 分支）
> 调研日期：本次调研当日
> 目的：为 WebDeck（electron-builder + GitHub Releases 分发的桌面包装器，Windows/macOS 均未签名、无自建服务器）评估借鉴点与不可用点

---

## 0. 结论速览（TL;DR）

- **更新库**：官方 `electron-updater` **6.7.0**（配套 electron-builder **26.15.6**、builder-util-runtime **9.5.0**），无自研更新器；通过 pnpm patch 微调了 electron-updater 的 URL 缓存参数（去掉 `noCache=` 随机查询串，改用 Cache-Control 头，以配合自家 CDN 缓存）。
- **触发时机**：主进程调度（非渲染层）——打包版启动 5 秒后首次检查，之后每 **4 小时 ±15% 随机抖动** 一次；连续失败指数退避 5/10/20/40/60 分钟封顶；设置面板另有手动"检查更新"入口。Portable（Windows 免安装版）与开发版不做自动检查。
- **下载/安装**：检查到新版本后默认自动下载（受偏好 `app.dist.auto_update.enabled` 控制）；**`autoInstallOnAppQuit = false`**——绝不随退出静默安装，必须用户点击"立即安装"；安装用 `quitAndInstall(true, true)` 静默安装并重启。**差分更新（blockmap）被整体关闭**（`disableDifferentialDownload = true` + NSIS `differentialPackage: false` + dmg `writeUpdateInfo: false`）。
- **通道**：`latest` / `rc` / `beta` 三条通道，通过 `autoUpdater.channel` 切换（对应 `latest.yml` / `rc.yml` / `beta.yml`），支持"测试计划"设置项在 UI 里切换 RC/Beta；`allowDowngrade = false`。
- **发布侧**：**GitHub Releases 是唯一发布源**（CI 上传全部产物含 `latest*.yml`、`rc*.yml`、`beta*.yml`、blockmap、`release-history.json`）；**Cloudflare Worker 每分钟 cron 轮询 GitHub API，把资产镜像同步到 R2 对象存储**，通过 `https://releases.cherry-ai.com`（generic provider）对外分发，并只保留最近 2 个版本、自动清理旧文件。
- **平台**：Windows 用 NSIS（支持自定义安装目录、`verifyUpdateCodeSignature: false` 降低未签名/弱签名场景的升级阻力）；macOS 出 dmg+zip、CI 里签名 + 条件公证（`afterSign`）；Linux 出 AppImage+deb+rpm，AppImage 走 electron-updater。
- **区域分流**：按出口 IP 国家区分 `cn` / `global`，请求头带 `X-Region`（国内/海外走不同分发策略）。

---

## 1. 升级方案总览

### 1.1 架构图

```
┌───────────────────────────── 发布侧 ─────────────────────────────┐
│                                                                   │
│  GitHub Releases（唯一发布源）                                      │
│  ├─ .github/workflows/release.yml（tag push / release/v* PR / 手动）│
│  │   三平台矩阵构建 → ncipollo/release-action draft 上传产物：       │
│  │   *.exe *.dmg *.zip *.AppImage *.deb *.rpm latest*.yml          │
│  │   rc*.yml beta*.yml *.blockmap release-history.json             │
│  │                                                                 │
│  └─▲  scripts/cloudflare-worker.js（Cloudflare Worker）             │
│     │  scheduled cron: */1 * * * *                                 │
│     │  轮询 GitHub API /releases/latest → 逐资产下载 → 写入 R2 bucket │
│     │  （cherrystudio 桶，自定义域名 cherrystudio.ocool.online）      │
│     │  维护 versions.json / 缓存 / logs.json，只保留最近 2 个版本     │
│     │                                                              │
│     ▼  HTTP 下载（generic provider）                                │
│  https://releases.cherry-ai.com/<文件>（latest.yml、安装包、blockmap…）│
└────────────────────────────────────────────────────────────────────┘

┌───────────────────────────── 客户端 ─────────────────────────────┐
│  主进程 AppUpdaterService（生命周期服务，@WhenReady）                │
│  ├─ 调度器：启动 5s 后首查 → 每 4h±15% 抖动；失败退避 5→60min        │
│  ├─ configureUpdaterForCheck：请求头（UA/Client-Id/App-Version/    │
│  │    OS/X-Region）+ channel（latest|rc|beta）+ allowDowngrade=false│
│  │    + disableDifferentialDownload=true                           │
│  ├─ autoUpdater.checkForUpdates()（electron-updater 6.7.0）         │
│  │    内部按 channel 拉取 <url>/<channel>.yml → semver 对比          │
│  ├─ 事件 → IpcApiService.broadcastToType(Main)：                    │
│  │    app.updater.available / not_available / download_progress /  │
│  │    downloaded / error                                           │
│  ├─ 下载：CancellationToken 可取消；quitAndInstall(true,true) 静默装 │
│  └─ 附带：ReleaseNotesUpdater（只读 release notes 的第二个实例）+    │
│       release-history.json 拉取（更新历史页）                        │
│                                                                    │
│  渲染层（主窗口）                                                    │
│  ├─ useAppUpdateHandler：IPC 事件 → toast/通知/弹窗                  │
│  ├─ AboutSettings：检查更新按钮 + 下载进度环 + 自动检查开关 + 测试通道 │
│  └─ UpdateDialogPopup：release notes + "稍后 / 立即安装 / 忽略"      │
└────────────────────────────────────────────────────────────────────┘
```

### 1.2 一次完整更新流程（时序）

1. **发布**：打 tag（或合并 `release/v*` 分支 / 手动触发）→ `release.yml` 在 macOS/Windows/Ubuntu 三机并行构建 → 产物以 **draft release** 上传到 GitHub Releases（`latest.yml` 等元数据由 electron-builder 在构建时自动生成）。
2. **镜像**：Cloudflare Worker 每分钟检查 GitHub 最新 release，把每个资产（含 yml 元数据、安装包、blockmap）拉取后写入 R2；同名文件大小一致则跳过（幂等），只保留最近两个版本的资产。
3. **客户端检查**：主进程调度或用户点击"检查更新" → `AppUpdaterService.performUpdateCheck()` → 组装请求头/通道 → `autoUpdater.checkForUpdates()` 请求 `https://releases.cherry-ai.com/latest.yml`（generic provider）。
4. **结果分发**：`update-available` / `update-not-available` 广播到主窗口；无更新且是手动检查时 toast"已是最新版本"；有更新时发系统通知并置状态 `available`。
5. **下载**：默认（`autoDownload=true`）自动下载；手动检查且偏好关闭自动下载时，代码显式调用 `downloadUpdate()` 仍会下载。进度经 `download-progress` 广播渲染为 Logo 环形进度。
6. **安装**：下载完成广播 `downloaded`；手动检查触发的场景自动弹出 `UpdateDialogPopup`（展示本地化 release notes）；用户点"立即安装" → IPC `app.updater.quit_and_install` → `autoUpdater.quitAndInstall(true, true)`：应用退出 → NSIS 静默安装 → 自动重启（Windows 为 `isSilent=true, isForceRunAfter=true`）。
7. **失败兜底**：`error` 事件广播；调度循环按退避策略重试；关机（PowerService shutdown handler）时把 `autoDownload` 置 false，避免关机途中下载/安装损坏。

---

## 2. 关键代码文件清单与核心逻辑摘录

### 2.1 主进程核心服务：`src/main/services/AppUpdaterService.ts`

这是整个更新方案的唯一核心模块（406 行），封装 electron-updater 的全局单例 `autoUpdater`。

**依赖与初始化**（`onInit`）：

```ts
autoUpdater.logger = logger as Logger
// 打包版读 app-update.yml（由 electron-builder.yml 生成）；开发版读仓库根 dev-app-update.yml
autoUpdater.forceDevUpdateConfig = !app.isPackaged
autoUpdater.autoDownload = application.get('PreferenceService').get('app.dist.auto_update.enabled')
// 绝不随退出自动安装——必须用户明确点"立即安装"。
// 自动安装会导致：重启时意外更新、系统关机时安装损坏、强制关机时应用被卸载
autoUpdater.autoInstallOnAppQuit = false

if (isWin) {
  ;(autoUpdater as NsisUpdater).installDirectory = application.getPath('app.install')
}
```

- Windows 专属：`installDirectory = path.dirname(app.getPath('exe'))`（见 `src/main/core/paths/pathRegistry.ts` L82 `'app.install': path.dirname(app.getPath('exe'))`）。即**把 NSIS 增量更新的安装目标指向当前 exe 所在目录**，从而支持 `allowToChangeInstallationDirectory: true` 的自定义安装路径（electron-updater 默认要求安装目录固定，这里显式对齐）。

**检查前配置**（`configureUpdaterForCheck`）：

```ts
autoUpdater.requestHeaders = {
  ...autoUpdater.requestHeaders,
  ...updateHeaders   // User-Agent / Cache-Control / Client-Id / App-Name / App-Version / OS / X-Region
}
autoUpdater.channel = requestedChannel   // 测试计划开启→rc/beta，否则 latest
autoUpdater.allowDowngrade = false
autoUpdater.disableDifferentialDownload = true  // 当前发布物不支持差分，整体关闭 blockmap
```

**检查与下载触发**（`performUpdateCheck`）：

```ts
this.updateCheckResult = await autoUpdater.checkForUpdates()
if (this.updateCheckResult?.isUpdateAvailable && !autoUpdater.autoDownload) {
  // autoDownload 为 false 时（手动检查且用户关闭了自动下载），仍需显式触发下载
  void autoUpdater.downloadUpdate(this.cancellationToken)
}
```

**调度循环**（自动检查的核心设计——放在主进程、跨窗口存活、全局唯一）：

```ts
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000      // 4 小时
const CHECK_JITTER_RATIO = 0.15                    // ±15% 随机抖动，避免全网客户端同一时刻打爆服务器
const INITIAL_CHECK_DELAY_MS = 5_000               // 启动 5s 后首查，等启动 I/O 稳定
// 退避策略：5/10/20/40/60 分钟指数退避，封顶 60min，且恒小于正常周期
const CHECK_RETRY_POLICY: RetryPolicy = { maxAttempts: 1, backoff: 'exponential',
  baseDelayMs: 5 * 60 * 1000, maxDelayMs: 60 * 60 * 1000 }
```

```ts
private async runScheduledUpdateCheck(): Promise<void> {
  try {
    if (application.get('PreferenceService').get('app.dist.auto_update.enabled')) {
      await this.performUpdateCheck()          // 仅"检测失败"驱动退避
    }
    this.updateCheckFailures = 0
    this.scheduleNextUpdateCheck(this.nextUpdateCheckDelayMs())  // 成功→按 4h±15% 续约
  } catch {
    this.updateCheckFailures++
    const backoffMs = computeBackoff(CHECK_RETRY_POLICY, this.updateCheckFailures)
    this.scheduleNextUpdateCheck(backoffMs)    // 失败→指数退避续约
  }
}
```

- 定时器由 `SchedulerService` 以 one-shot 方式注册、回调里自我续约（同一 id 覆盖旧定时器），实现"常驻循环"；`onAllReady` 中通过 `PowerService.registerShutdownHandler` 在关机时把 `autoDownload` 置 false。
- **跳过场景**：开发版（`!app.isPackaged`）跳过自动检查但保留手动检查；Windows Portable（`PORTABLE_EXECUTABLE_DIR in process.env`）完全不检查（`isPortable()`）。

**安装**：

```ts
public quitAndInstall() {
  application.markQuitting()
  setImmediate(() => autoUpdater.quitAndInstall(true, true))  // isSilent=true, isForceRunAfter=true
}
```

**事件 → 渲染层广播**（`registerAutoUpdaterListeners`，均为 `broadcastToType(WindowType.Main, ...)`）：

| 事件 | 载荷 | 渲染层用途 |
|---|---|---|
| `app.updater.error` | Error | 手动检查时弹错误提示 |
| `app.updater.available` | UpdateInfo（releaseNotes 已本地化） | 系统通知 + 状态置 available |
| `app.updater.not_available` | undefined | 手动检查时 toast"已是最新" |
| `app.updater.download_progress` | ProgressInfo | Logo 环形进度 |
| `app.updater.downloaded` | UpdateInfo | 手动检查场景自动弹更新对话框 |

**附带能力**：
- `ReleaseNotesUpdater extends AppUpdater`：第二个只读 updater 实例（`doDownloadUpdate`/`quitAndInstall` 直接抛错），用于拉取最新版 release notes 而不触发下载。
- `getReleaseHistory()`：并行拉取 `https://releases.cherry-ai.com/release-history.json`（`net.fetch`，10s 超时、1MB 上限）与最新 release notes，合并去重排序后供"更新历史"页展示。
- `cancelDownload()`：`CancellationToken` 取消进行中的下载；订阅 `app.dist.test_plan.enabled/channel` 变化，测试通道切换时自动取消下载。

### 2.2 偏好与通道：`src/shared/data/preference/preferenceTypes.ts` / `preferenceSchemas.ts`

```ts
export enum UpgradeChannel {
  LATEST = 'latest', // 最新稳定版本
  RC = 'rc',         // 公测版本
  BETA = 'beta'      // 预览版本
}
```

默认值（`preferenceSchemas.ts` L552-554）：`app.dist.auto_update.enabled: true`、`app.dist.test_plan.channel: LATEST`、`app.dist.test_plan.enabled: false`。

通道映射到 generic provider 的元数据文件名：`latest → latest.yml`、`rc → rc.yml`、`beta → beta.yml`（与 release.yml 上传的 `latest*.yml / rc*.yml / beta*.yml` 一一对应）。

### 2.3 IPC 层：`src/main/ipc/handlers/app.ts`

```ts
'app.updater.check_for_update': async () => { await application.get('AppUpdaterService').checkForUpdates() },
'app.updater.release_notes.get': async () => application.get('AppUpdaterService').getReleaseHistory(),
'app.updater.quit_and_install': async () => { application.get('AppUpdaterService').quitAndInstall() }
```

### 2.4 渲染层事件处理：`src/renderer/windows/main/hooks/useAppUpdateHandler.ts`

核心设计点：**用 `manualCheck` 标志区分自动检查与手动检查**，决定"无更新/失败"是否打扰用户（自动检查失败静默，仅记录日志）：

```ts
useIpcOn('app.updater.not_available', () => {
  updateAppUpdateState({ checking: false, manualCheck: false })
  if (manualCheckRef.current) {   // 只有用户手动点"检查更新"才提示"已是最新"
    toast.success(t('settings.about.updateNotAvailable'))
  }
})
useIpcOn('app.updater.available', (releaseInfo) => {
  void notificationService.send({ type: 'info', title: t('button.update_available'), ... })
  updateAppUpdateState({ checking: false, downloading: true, info: releaseInfo, available: true })
})
useIpcOn('app.updater.downloaded', (releaseInfo) => {
  updateAppUpdateState({ downloading: false, info: releaseInfo, downloaded: true })
  if (manualCheckRef.current) {   // 只有手动检查才自动弹出安装对话框
    import('@renderer/components/UpdateDialogPopup').then(({ default: UpdateDialogPopup }) =>
      UpdateDialogPopup.show({ releaseInfo }))
  }
})
```

状态存在 `useAppUpdateState`（基于缓存 `app.dist.update_state`，跨窗口/跨重启保留）：

```ts
export type CacheAppUpdateState = {
  info: UpdateInfo | null
  checking: boolean; downloading: boolean; downloaded: boolean
  downloadProgress: number; available: boolean; ignore: boolean
  manualCheck: boolean
}
```

### 2.5 设置面板入口：`src/renderer/pages/settings/AboutSettings/AboutSettings.tsx`

- "检查更新"按钮（`onCheckUpdate`，2s debounce）：`checking/downloading` 时防重；若已下载完成则直接打开 `UpdateDialogPopup`；否则置 `manualCheck: true` 并发起 `app.updater.check_for_update`。
- Logo 上叠加 `CircularProgress` 环形下载进度（`download-progress` 驱动）。
- 自动检查开关：`usePreference('app.dist.auto_update.enabled')`。
- 测试计划：开关 + `SegmentedControl`（RC / Beta），直接写偏好，主进程订阅变化并取消在途下载。
- 版本号 `v{version}` badge 跳 GitHub Releases；Portable 版本隐藏全部更新入口。
- 下载完成的按钮文案变为"available"，主按钮高亮。

### 2.6 安装对话框：`src/renderer/components/UpdateDialogPopup.tsx`

- 展示 release notes（`UpdateInfo.releaseNotes`，字符串或 `ReleaseNoteInfo[]` 两种形态兼容）+ 版本号。
- 三个动作："稍后"（`updateAppUpdateState({ ignore: true })`）、"立即安装"（IPC `app.updater.quit_and_install`）、关闭即取消。
- 动态 import（S6c 分包）避免把 markdown 渲染栈拖进首屏。

### 2.7 release notes 本地化：`src/shared/utils/releaseNotes.ts` + `electron-builder.yml` 的 `releaseInfo.releaseNotes`

- `releaseNotes` 用 `<!--LANG:en-->` / `<!--LANG:zh-CN-->` / `<!--LANG:END-->` 标记内嵌中英双语（写入 `electron-builder.yml` 的 `releaseInfo.releaseNotes`，并随 `latest.yml` 下发）。
- `processReleaseInfo()`（AppUpdaterService）按用户语言裁剪；`release-history.json` 的同格式条目由 `parseReleaseHistory` 严格校验（稳定版 semver、双语标记完整、无重复版本）。

### 2.8 对 electron-updater 的 patch：`patches/electron-updater-npm-6.7.0-47b11bb0d4.patch`

```diff
--- a/out/util.js
-        result.search = `noCache=${Date.now().toString(32)}`;
+        // use no cache header instead
+        // result.search = `noCache=${Date.now().toString(32)}`;
```

去掉 electron-updater 给每个请求加的 `noCache=` 随机查询串（其目的是绕过 HTTP 缓存），改为依赖自定义的 `Cache-Control: no-cache` 请求头——这样自家 CDN（R2/Cloudflare）可以对 `latest.yml` 做真正的缓存，降低源站压力。

### 2.9 打包配置：`electron-builder.yml`（publish 段）

```yaml
win:
  artifactName: ${productName}-${version}-${arch}-setup.${ext}
  target:
    - target: nsis
    - target: portable
  signtoolOptions:
    sign: scripts/win-sign.js
  verifyUpdateCodeSignature: false          # 显式关闭升级包签名校验
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true  # 配合 installDirectory 对齐逻辑
  include: build/nsis-installer.nsh
  differentialPackage: false                # 关闭 NSIS 差分（blockmap）
mac:
  notarize: false                           # 公证改由 afterSign 脚本按环境变量条件触发
  target:
    - target: dmg
    - target: zip
dmg:
  writeUpdateInfo: false                    # dmg 不写更新元数据（更新走 zip）
linux:
  target:
    - target: AppImage
    - target: deb
    - target: rpm
publish:
  provider: generic
  url: https://releases.cherry-ai.com
```

### 2.10 开发调试：`dev-app-update.yml`

```yaml
provider: generic
url: http://127.0.0.1:3378    # 本地起一个静态服务器放 yml/安装包即可在 dev 模式测更新
```

配合 `autoUpdater.forceDevUpdateConfig = !app.isPackaged`，开发版走本地配置，打包版走构建时生成的 `app-update.yml`。

---

## 3. 跨平台处理矩阵

| 平台 | 安装格式 | electron-updater 更新机制 | 签名/公证要求 | 差分更新 | Cherry 的关键配置 | 备注 |
|---|---|---|---|---|---|---|
| Windows | NSIS（`setup.exe`）+ Portable | `NsisUpdater`：下载新 setup.exe → 退出应用 → 静默执行安装（`/S`）→ 重启 | 生产构建用自研 `win-sign.js`（signtool，多时间戳服务器轮询重试，`WIN_SIGN` 环境变量开启）；**`verifyUpdateCodeSignature: false`** 显式关闭升级包签名校验 | 关闭（`differentialPackage: false`；运行时 `disableDifferentialDownload = true`） | `oneClick: false`、`allowToChangeInstallationDirectory: true`、`installDirectory = exe 所在目录` | `build/nsis-installer.nsh` 在 `customInit` 里做架构匹配检查、VC++ 运行库自动安装/提权检测；Portable 版**不参与**自动更新 |
| macOS | dmg（官网分发）+ zip（更新用） | `MacUpdater`：下载新 zip → 解压替换 `.app` | CI 传 `CSC_LINK/CSC_KEY_PASSWORD`（Developer ID 签名）；`afterSign: scripts/notarize.js` 在 `APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID` 齐备时用 `@electron/notarize` 公证（`mac.notarize: false` 只是让 yml 不强制） | dmg `writeUpdateInfo: false`；zip 差分同样被全局关闭 | 更新走 zip，dmg 仅官网下载 | 未签名/未公证时 macOS 基本无法可靠自动更新（替换后的 app 会被 Gatekeeper 拦截），签名是硬前提 |
| Linux | AppImage（更新用）+ deb + rpm | `AppImageUpdater`：下载新 AppImage → 写临时文件 → 替换运行中的 AppImage（`APPIMAGE` 环境变量定位自身） | 无签名要求 | 全局关闭 | AppImage 目标 | deb/rpm 由系统包管理器管理，不走 electron-updater |
| 通用 | — | generic provider + channel（latest/rc/beta） | — | — | `publish: { provider: generic, url: https://releases.cherry-ai.com }` | 请求头带 `X-Region`（cn/global 分流，`RegionService.getCountry()` 按出口 IP 判定，失败默认 CN） |

---

## 4. 失败 / 回滚处理

Cherry Studio 没有显式的"回滚到上一版本"机制（electron-updater 也不原生支持回滚），而是通过**前置防御 + 事件上报 + 重试**降低失败概率：

1. **不静默安装**：`autoInstallOnAppQuit = false`——更新安装只发生在用户明确点击"立即安装"之后，规避"退出即装、重启即坏"的不可控窗口；注释里明确列出自动安装的三类事故（重启时意外更新、关机时安装损坏、强制关机时应用被卸载）。
2. **关机保护**：`PowerService.registerShutdownHandler(() => { autoUpdater.autoDownload = false })`，系统关机/退出时停止下载，防止半成品文件。
3. **调度退避**：自动检查失败按 5→60 分钟指数退避，成功后恢复 4h 周期；手动检查的失败通过 `error` 事件广播，仅手动场景弹错误提示。
4. **下载可取消**：`CancellationToken` 贯穿 `downloadUpdate`；切换测试通道时主动 `cancelDownload()` 并重置状态。
5. **版本约束**：`allowDowngrade = false`（防换通道时降级）；通道变更后强制置 false。
6. **签名校验**：Windows 侧 `verifyUpdateCodeSignature: false`——对未签名/签名不一致的升级包不做硬校验（这是为了兼容未签名构建的取舍，安全性下降）。
7. **installDirectory 对齐**：Windows 把更新安装目录强制对齐 exe 所在目录，避免"用户把应用装到自定义路径后，更新装回默认路径"这类路径漂移问题。
8. **下载完整性**：依赖 electron-updater 内置的文件校验（latest.yml 中的 `sha512`）；差分被关闭，全量下载天然规避差分补丁不匹配问题。

---

## 5. 服务端 / 发布侧：`latest.yml` 等元数据的生成与分发

### 5.1 元数据生成

`latest.yml` / `latest-mac.yml` / `latest-linux.yml`（及 `rc.yml`、`beta.yml`）**不是手写的**，是 electron-builder 在 `electron-builder --win/--mac/--linux` 构建时自动生成的（含版本、路径、`sha512`、`releaseNotes`、`files` 清单、`blockMapSize` 等），与安装包一起落在 `dist/`。

### 5.2 发布流水线：`.github/workflows/release.yml`

- 触发：`push`（打 tag）/ `workflow_dispatch`（手动选 tag 与平台）/ 合并 `release/v*` PR（`pull_request_target`）。
- 三平台矩阵并行（`macos-latest / windows-latest / ubuntu-latest`，`fail-fast: false`），`npm version $TAG` 对齐版本后 `pnpm build:*`。
- 用 `ncipollo/release-action@v1` 上传（`draft: true`、`allowUpdates: true`）：

```
artifacts: "dist/*.exe,dist/*.zip,dist/*.dmg,dist/*.AppImage,dist/*.snap,
            dist/*.deb,dist/*.rpm,dist/*.tar.gz,
            dist/latest*.yml,dist/rc*.yml,dist/beta*.yml,dist/*.blockmap
            [,resources/cherry-studio/release-history.json]"  # 仅 ubuntu + 稳定版 tag
```

- 稳定版（tag 不含 `-`）由 ubuntu 机额外上传 `release-history.json`（仓库内维护的双语更新历史，见 `resources/cherry-studio/release-history.json`）。

### 5.3 分发：`scripts/cloudflare-worker.js`（关键：GitHub → 自家 CDN 的镜像）

- **为什么不用 GitHub Releases 直连**：国内访问 GitHub 不稳；R2/CDN 更快、可控、可缓存。
- Worker `scheduled`（cron 每分钟）执行 `checkNewRelease()`：
  1. 请求 `https://api.github.com/repos/CherryHQ/cherry-studio/releases/latest`；
  2. 遍历 `releaseData.assets`，若 R2 中同名文件不存在或 size 不一致，则从 `browser_download_url` 拉取并写入 R2（幂等，重复跑不会重复下载）；
  3. 维护 `versions.json`（版本数据库）、缓存 `cherry-studio-latest-release`、日志 `logs.json`（上限 1000 条）；
  4. **只保留最近 2 个版本**：`listAllFiles` 枚举桶内文件，删除旧版本资产及遗留文件。
- `fetch`（HTTP 入口）按路径从 R2 直接吐文件（`handleDownload`），带正确的 Content-Type（exe/dmg/zip/AppImage/blockmap 映射）与 `Content-Disposition: attachment`；路径为空时返回缓存的版本信息 JSON。
- 发布 URL `https://releases.cherry-ai.com` 即该 Worker / R2 自定义域名的对外地址（桶自定义域名 `cherrystudio.ocool.online`）。
- `release-history.json` 也被镜像到 R2，客户端用它渲染"更新历史"页。

### 5.4 发布侧小结

**GitHub Releases 是事实上的发布源与存储**，Cloudflare Worker 只是把它同步到自家 CDN 的边缘；`latest.yml` 等元数据由 electron-builder 生成、随 release 上传、再由 Worker 原样镜像。因此客户端更新链路是标准的 electron-updater generic provider 协议，服务器无需任何特殊逻辑。

---

## 6. 对 WebDeck 的借鉴建议（适用 / 不适用）

> WebDeck 现状：electron-builder + GitHub Releases 分发，Windows 未签名、macOS 未签名、无自建服务器。

### 6.1 直接可借鉴（高性价比）

1. **沿用 electron-updater + 直接指向 GitHub Releases**。
   Cherry 用 generic provider + 自建 CDN 是体量/网络原因；WebDeck 无服务器，直接 `publish: { provider: github, owner: ..., repo: ... }` 即可，electron-updater 原生支持从 GitHub Releases 读 `latest*.yml` 并下载资产（私有仓库可用 token，公开仓库零配置）。这是把 Cherry 的"发布侧"整段砍掉后的等价最小实现。
2. **调度模型照搬**：主进程定时器（启动延迟 5s + 固定间隔 ±抖动 + 失败指数退避），比"窗口内 setInterval"稳健，天然跨窗口、全局唯一。间隔可按 WebDeck 体量放宽（如 6–12h），抖动与退避公式可直接复用。
3. **`autoInstallOnAppQuit = false` + 用户显式点击安装**：这是 Cherry 从事故里总结出的防御性设计，对任何桌面应用都适用，WebDeck 应直接采用。
4. **手动检查与自动检查用 `manualCheck` 标志区分提示行为**：自动检查静默（不弹"已是最新"、失败不打扰），手动检查才有 toast/弹窗——避免自动更新打扰用户。
5. **更新 UI 模式照抄**：设置页"检查更新"按钮 + 下载进度（环形）+ 下载完成弹窗（release notes + 稍后/立即安装/忽略）；Portable/未打包场景隐藏入口。
6. **开发模式用 `dev-app-update.yml` + 本地静态服务器**调试更新链路，`forceDevUpdateConfig = !app.isPackaged`。
7. **Windows `verifyUpdateCodeSignature: false`**：未签名应用若保持默认 `true`，electron-updater 在签名校验上可能卡住；显式关闭最省事（代价是失去防中间人校验，WebDeck 无签名证书时可接受）。
8. **Windows 自定义安装目录**：若 WebDeck 的 NSIS 允许用户改安装路径，务必同步设置 `(autoUpdater as NsisUpdater).installDirectory = path.dirname(app.getPath('exe'))`，否则增量更新会装回默认目录造成"双实例"混乱。
9. **单通道起步**：先只发 `latest`（稳定版），RC/Beta 通道、测试计划 UI 等大产品功能按需裁剪。

### 6.2 不可用 / 需改造（关键约束）

1. **macOS 未签名 = 自动更新基本不可用**。macOS 的 electron-updater（Squirrel.Mac 系）要求应用签名，且替换后的 app 必须通过 Gatekeeper/公证才能运行；未签名应用即使更新成功也无法启动，或直接被拦截。WebDeck 的 macOS 退路：**检测到新版本时不做自动安装，改为打开下载页/引导用户手动下载 dmg**（或仅提示"有新版本，请到官网下载"）。若日后想全自动，必须走 Developer ID 签名 + 公证（Cherry 的 `afterSign` 条件公证脚本可参考）。
2. **Windows 未签名可行但有代价**：NSIS 更新流程本身不依赖签名（配合 `verifyUpdateCodeSignature: false`），但安装/更新时会触发 SmartScreen 警告（"未知发布者"），部分企业环境会拦截。功能可用，体验打折；建议同步做"下载页 + 手动安装"兜底。
3. **差分更新（blockmap）**：Cherry 出于自家 CDN 原因全局关闭（`disableDifferentialDownload` + `differentialPackage: false` + dmg `writeUpdateInfo: false`）。WebDeck 走 GitHub Releases 时**可以开启**差分（electron-builder 默认生成 `.blockmap`，electron-updater 自动用），能显著减少 Windows/macOS 更新流量——前提是 WebDeck 不介意 GitHub 上多几个 blockmap 文件；若更看重简单，则照 Cherry 关闭也无妨（全量包）。
4. **多语言 release notes / 区域分流（cn/global）/ release-history 页 / 版本数据库 / 只保留 2 版清理策略**：这些是 Cherry 面向全球+国内用户的产品化能力，WebDeck 无服务器场景下全部不适用；release notes 直接用单语言即可。
5. **Cloudflare Worker 同步 R2 的整套"自建分发"**：对 WebDeck 不必要（GitHub Releases 直连即可），但若未来 WebDeck 也遇到"国内下载慢"，可原样照搬这套 worker 脚本（开源、幂等、自动清理）。
6. **`noCache` patch**：Cherry 的 electron-updater patch 是为自家 CDN 缓存服务的；WebDeck 直连 GitHub Releases 无需此 patch，保持上游原版即可。

### 6.3 建议的最小落地清单（供后续 /spec 流程参考，不在此次实现）

- 主进程：`AppUpdaterService` 精简版（调度 + configure + check + 事件广播 + `quitAndInstall(true, true)` + `autoInstallOnAppQuit=false` + `allowDowngrade=false`）。
- 配置：`electron-builder.yml` 增加 `publish: { provider: github, owner, repo }`；Win 增 `verifyUpdateCodeSignature: false`；mac 保持 dmg/zip（zip 用于更新）但**默认只提示不自动装**（未签名）。
- 渲染层：设置页检查入口 + 下载进度 + 更新弹窗（manualCheck 语义）。
- 发布：release workflow 上传 `dist/*.yml`、`*.blockmap`、安装包到 GitHub Releases（含 latest-mac.yml 等自动生成的元数据）。

---

## 7. 引用的关键文件路径（调研基线 commit 6e66e82）

**客户端（主进程）**
- `src/main/services/AppUpdaterService.ts` — 更新核心（调度/检查/下载/安装/事件）
- `src/main/ipc/handlers/app.ts` — `app.updater.*` IPC 入口
- `src/main/core/application/serviceRegistry.ts` — 服务注册
- `src/main/core/paths/pathRegistry.ts` — `app.install` 路径定义（L82）
- `src/main/services/RegionService.ts` — 出口国家判定（cn/global）
- `src/main/services/__tests__/AppUpdaterService.scheduler.test.ts`、`AppUpdaterService.test.ts` — 调度与配置单测

**客户端（渲染层）**
- `src/renderer/windows/main/hooks/useAppUpdateHandler.ts` — IPC 事件 → UI
- `src/renderer/hooks/useAppUpdateState.ts` — 更新状态（缓存）
- `src/renderer/components/UpdateDialogPopup.tsx` — 安装对话框
- `src/renderer/pages/settings/AboutSettings/AboutSettings.tsx` — 设置面板更新入口
- `src/renderer/pages/releaseNotes/ReleaseNotesPage.tsx` — 更新历史页

**共享/配置**
- `src/shared/data/preference/preferenceTypes.ts`（L140 `UpgradeChannel`）、`preferenceSchemas.ts`（默认值 L552-554）
- `src/shared/utils/releaseNotes.ts` — 双语 release notes 解析/本地化/合并
- `src/shared/data/cache/cacheValueTypes.ts` — `CacheAppUpdateState`

**打包/发布**
- `electron-builder.yml` — publish generic + 平台目标 + 签名/公证钩子
- `dev-app-update.yml` — 开发模式更新源
- `patches/electron-updater-npm-6.7.0-47b11bb0d4.patch` — 去 noCache 查询串
- `build/nsis-installer.nsh` — NSIS 定制（提权/架构/VC++ 运行库）
- `scripts/win-sign.js`、`scripts/notarize.js` — Windows 签名、macOS 条件公证
- `scripts/artifact-build-completed.js` — 产物重命名
- `scripts/cloudflare-worker.js` — 更新服务器（GitHub → R2 镜像 Worker）
- `.github/workflows/release.yml`、`prepare-release.yml`、`nightly-build.yml` — 发布流水线
- `resources/cherry-studio/release-history.json` — 双语更新历史数据
- `package.json`（L338/342/311：electron-builder 26.15.6 / electron-updater 6.7.0 / builder-util-runtime 9.5.0）
