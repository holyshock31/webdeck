// updater.js — 主进程更新服务（electron-updater 封装，精简版 AppUpdaterService）
// 方案参考 Cherry Studio（调研：.tmp-cherry-research/REPORT.md + docs/research/cherry-studio-update-deep-dive.md）：
//   - 主进程调度：启动延迟首查 + 周期 ± 抖动 + 失败指数退避（策略见 updater-policy.js）
//   - autoInstallOnAppQuit = false：必须用户点"立即安装"
//   - Windows 未签名产物：verifyUpdateCodeSignature = false
//   - portable（PORTABLE_EXECUTABLE_DIR）与开发版不做自动检查
// 加固项（harden-update-service）：
//   - Windows 打包态 installDirectory 对齐当前 exe 目录（自定义安装目录防双实例）
//   - 关机/退出保护：powerMonitor shutdown + app before-quit → autoDownload = false 并取消在途下载
//   - logSink 注入：检查/下载/安装/错误事件写入 webdeck.log（与主进程链路同一落盘通道）
//   - CancellationToken 贯穿下载 + cancelDownload()（IPC updater:cancel）
// 对齐项（add-update-parity）：
//   - autoUpdater.logger 注入：electron-updater 内部日志（下载源/差分回退/staging）一并落盘
//   - forceDevUpdateConfig = !isPackaged：开发态读取 dev-app-update.yml，可本地调试更新链路
//   - 系统通知：发现新版/下载完成（Notification.isSupported 守卫，点击聚焦窗口）
//   - release notes 多语言本地化（localizeReleaseNotes，按 app.getLocale()）
//   - 偏好开关：autoDownload 由 settings.autoUpdateEnabled 驱动；调度每 tick 门控（手动检查不受限）
//   - dispose()：退出时清理调度定时器与 autoUpdater 监听器
// Electron 主进程 ESM 加载器不识别 CJS 的 named export，须默认导入后解构
import updaterPkg from 'electron-updater';
const { autoUpdater, NsisUpdater } = updaterPkg;
import { app, shell, ipcMain, powerMonitor, Notification } from 'electron';
import {
  CHECK_INTERVAL_MS,
  INITIAL_CHECK_DELAY_MS,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  computeBackoff,
  nextCheckDelay,
  isPortableEnv,
  installDirectoryFor,
  shouldLogProgress,
  localizeReleaseNotes,
} from './updater-policy.js';

/**
 * 创建更新服务。
 * @param {{
 *   getWindow: () => import('electron').BrowserWindow | null,
 *   logSink?: (line: string) => void,   // 落盘日志通道（fileLog.log），未注入时静默
 *   getAutoUpdateEnabledPref?: () => Promise<boolean>,  // 读取偏好开关（默认 true）
 *   setAutoUpdateEnabledPref?: (enabled: boolean) => Promise<unknown>,  // 持久化偏好开关
 * }} deps
 */
export function createUpdater({
  getWindow,
  logSink,
  getAutoUpdateEnabledPref = async () => true,
  setAutoUpdateEnabledPref = async () => {},
}) {
  let timer = null;
  let failures = 0;
  let started = false;
  let disposed = false;
  let autoUpdateEnabled = true; // 偏好开关（settings.autoUpdateEnabled，默认开）
  let cancelToken = null; // 进行中下载的取消令牌（来自 checkForUpdates 结果，autoDownload=true 时驱动本次下载）
  let lastLoggedPct = -1; // 下载进度落盘节流：最近一次已写入的百分比
  const listeners = []; // [event, handler] 对，dispose() 时摘除

  const log = (line) => logSink?.(`[updater] ${line}`);

  // electron-updater 内部日志（检查结果/下载源 URL/差分回退/staging 校验等）一并落盘
  autoUpdater.logger = {
    info: (msg) => log(`info ${String(msg ?? '')}`),
    warn: (msg) => log(`warn ${String(msg ?? '')}`),
    error: (msg) => log(`error ${String(msg ?? '')}`),
    debug: (msg) => log(`debug ${String(msg ?? '')}`),
  };
  // 开发态读取仓库根 dev-app-update.yml（否则 checkForUpdates 直接跳过），打包态不受影响
  autoUpdater.forceDevUpdateConfig = !app.isPackaged;

  const broadcast = (channel, payload = {}) => {
    getWindow()?.webContents.send('updater:event', { type: channel, ...payload });
  };

  /** 系统通知（isSupported 守卫）：发现新版/下载完成时提醒，点击聚焦主窗口。 */
  function notify(title, body) {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body });
    n.on('click', () => {
      const w = getWindow();
      if (!w) return;
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
    });
    n.show();
  }

  /** 广播前处理 release info：release notes 按应用语言本地化（Cherry processReleaseInfo 等价物）。 */
  function processReleaseInfo(info) {
    if (info?.releaseNotes && typeof info.releaseNotes === 'string') {
      return { ...info, releaseNotes: localizeReleaseNotes(info.releaseNotes, app.getLocale()) };
    }
    return info;
  }

  const on = (event, handler) => {
    autoUpdater.on(event, handler);
    listeners.push([event, handler]);
  };

  function configure() {
    autoUpdater.autoDownload = autoUpdateEnabled;
    // 绝不随退出自动安装：重启时意外更新 / 关机时安装损坏 / 强制关机时应用被卸载
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    if (process.platform === 'win32') {
      // Windows 未签名产物：关闭升级包签名校验（否则 electron-updater 在校验上卡住）
      autoUpdater.verifyUpdateCodeSignature = false;
      // NSIS 开了 allowToChangeInstallationDirectory：用户自定义安装路径后，更新必须装到
      // 当前 exe 所在目录，否则增量更新装回默认目录 → 双实例（旧版还在跑、新版装别处）。
      // 仅打包态生效：开发态 app.getPath('exe') 是 electron 二进制，跳过。
      const installDir = installDirectoryFor(process.platform, app.isPackaged, app.getPath('exe'));
      if (installDir) {
        if (autoUpdater instanceof NsisUpdater) {
          autoUpdater.installDirectory = installDir;
          log(`install-directory aligned to ${installDir}`);
        } else {
          log(`install-directory skip: autoUpdater is ${autoUpdater?.constructor?.name ?? 'unknown'}, not NsisUpdater`);
        }
      } else {
        log('install-directory skip: development mode');
      }
    }
  }

  /** 关机/退出保护：停止发起新下载并取消在途下载，防半成品文件导致下次启动更新损坏。 */
  function protectShutdown() {
    const stopDownloads = (why) => {
      autoUpdater.autoDownload = false;
      if (cancelToken) {
        cancelToken.cancel();
        cancelToken = null;
      }
      log(`${why}: autoDownload disabled, in-flight download cancelled`);
    };
    powerMonitor.on('shutdown', stopDownloads);
    app.on('before-quit', stopDownloads);
    listeners.push(['powerMonitor:shutdown', stopDownloads]);
    listeners.push(['app:before-quit', stopDownloads]);
  }

  async function performCheck() {
    try {
      const result = await autoUpdater.checkForUpdates();
      // autoDownload=true 时 checkForUpdates 立即开始下载，结果携带驱动该次下载的
      // cancellationToken——捕获后供 cancelDownload() 取消（无更新时不带 token）。
      cancelToken = result?.cancellationToken ?? null;
      return result;
    } catch (err) {
      log(`check error ${String(err?.message ?? err)}`);
      broadcast('error', { message: String(err?.message ?? err) });
      throw err;
    }
  }

  function scheduleNext(delay) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (disposed) return;
      if (!autoUpdateEnabled) {
        // 偏好关闭：循环空转（排程不取消），重新开启后自动恢复——与 Cherry 每 tick 门控一致
        scheduleNext(nextCheckDelay(CHECK_INTERVAL_MS));
        return;
      }
      try {
        await performCheck();
        failures = 0;
        scheduleNext(nextCheckDelay(CHECK_INTERVAL_MS));
      } catch {
        failures += 1;
        scheduleNext(computeBackoff(RETRY_BASE_MS, RETRY_MAX_MS, failures));
      }
    }, delay);
  }

  /** 挂载 autoUpdater 事件监听（registerIpc 恒调用——开发态手动检查同样需要事件管道，与 Cherry onInit 挂载一致）。 */
  let listenersAttached = false;
  function attachListeners() {
    if (listenersAttached) return;
    listenersAttached = true;
    on('checking-for-update', () => log('checking-for-update'));
    on('update-available', (info) => {
      lastLoggedPct = -1; // 新一轮下载：重置进度节流
      log(`update-available version=${info?.version}`);
      notify('WebDeck 更新', `发现新版本 v${info?.version}`);
      broadcast('available', processReleaseInfo(info));
    });
    on('update-not-available', () => {
      log('update-not-available');
      broadcast('not_available');
    });
    on('download-progress', (p) => {
      const pct = p?.percent ?? 0;
      if (shouldLogProgress(pct, lastLoggedPct)) {
        lastLoggedPct = pct;
        log(`download-progress ${Math.round(pct)}%`);
      }
      broadcast('download_progress', p);
    });
    on('update-downloaded', (info) => {
      lastLoggedPct = -1;
      log(`update-downloaded version=${info?.version}`);
      notify('WebDeck 更新', '新版本已下载完成，可立即安装');
      broadcast('downloaded', processReleaseInfo(info));
    });
    on('update-cancelled', (info) => {
      cancelToken = null;
      lastLoggedPct = -1;
      log(`update-cancelled version=${info?.version}`);
      broadcast('cancelled', { version: info?.version });
    });
    on('error', (err) => {
      log(`error ${String(err?.message ?? err)}`);
      broadcast('error', { message: String(err?.message ?? err) });
    });
  }

  /** 启动自动检查调度（打包版 + 非 portable）。 */
  async function start() {
    if (started || disposed) return;
    if (!app.isPackaged || isPortableEnv()) return; // 开发版/portable 跳过自动检查
    started = true;
    autoUpdateEnabled = (await getAutoUpdateEnabledPref()) !== false;
    configure();
    protectShutdown();
    scheduleNext(INITIAL_CHECK_DELAY_MS);
  }

  /** 手动检查：明确反馈（成功/失败），不驱动退避调度；不受偏好开关限制。 */
  async function manualCheck() {
    try {
      await performCheck();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  }

  /** 用户点击"立即安装"：静默安装并重启。 */
  function quitAndInstall() {
    log('quit-and-install invoked');
    // 同步抛出与异步失败（Squirrel.Mac 签名校验等）都要上报：
    // 异步失败经 nativeUpdater 'error' → 既有 on('error') 广播；同步异常在此捕获。
    // 渲染层在"已下载待安装"状态下收到 error 会展示失败原因与"打开下载页"兜底，
    // 避免 macOS 安装失败时界面静默无反馈（v0.1.14 事故）。
    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall(true, true);
      } catch (err) {
        log(`quit-and-install error ${String(err?.message ?? err)}`);
        broadcast('error', { message: String(err?.message ?? err) });
      }
    });
  }

  /** 退化路径：macOS（未签名）/portable 等不自动安装，引导打开 Releases 下载页。 */
  function openDownloadPage() {
    shell.openExternal('https://github.com/holyshock31/webdeck/releases/latest');
  }

  /** 取消进行中的下载（下载卡住/误触发时用户可中止；取消后可重新检查下载）。 */
  function cancelDownload() {
    const token = cancelToken;
    cancelToken = null;
    if (token) {
      token.cancel();
      log('cancel-requested');
      return { ok: true };
    }
    return { ok: false, error: '没有进行中的下载' };
  }

  /** 偏好开关：立即生效（autoDownload）并持久化；手动检查不受影响。 */
  async function setAutoUpdateEnabled(enabled) {
    autoUpdateEnabled = !!enabled;
    autoUpdater.autoDownload = autoUpdateEnabled;
    await setAutoUpdateEnabledPref(autoUpdateEnabled);
    log(`auto-update ${autoUpdateEnabled ? 'enabled' : 'disabled'}`);
    return { ok: true, autoUpdateEnabled };
  }

  /** 退出清理：清除调度定时器、摘除全部监听器（含关机保护）。 */
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    for (const [event, handler] of listeners) {
      if (event === 'powerMonitor:shutdown') powerMonitor.removeListener('shutdown', handler);
      else if (event === 'app:before-quit') app.removeListener('before-quit', handler);
      else autoUpdater.removeListener(event, handler);
    }
    listeners.length = 0;
    log('disposed');
  }

  /** 注册更新相关 IPC（检查/安装/取消/开关/打开下载页）并挂载事件监听（幂等）。 */
  function registerIpc() {
    ipcMain.handle('updater:check', () => manualCheck());
    ipcMain.handle('updater:quit-install', () => { quitAndInstall(); return { ok: true }; });
    ipcMain.handle('updater:cancel', () => cancelDownload());
    ipcMain.handle('updater:set-auto-update', (_e, enabled) => setAutoUpdateEnabled(enabled));
    ipcMain.handle('updater:open-download', () => { openDownloadPage(); return { ok: true }; });
    attachListeners();
  }

  return {
    start,
    manualCheck,
    quitAndInstall,
    cancelDownload,
    setAutoUpdateEnabled,
    dispose,
    openDownloadPage,
    registerIpc,
  };
}
