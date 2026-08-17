// updater.js — 主进程更新服务（electron-updater 封装，精简版 AppUpdaterService）
// 方案参考 Cherry Studio（调研：.tmp-cherry-research/REPORT.md）：
//   - 主进程调度：启动延迟首查 + 周期 ± 抖动 + 失败指数退避（策略见 updater-policy.js）
//   - autoInstallOnAppQuit = false：必须用户点"立即安装"
//   - Windows 未签名产物：verifyUpdateCodeSignature = false
//   - portable（PORTABLE_EXECUTABLE_DIR）与开发版不做自动检查
// 加固项（harden-update-service）：
//   - Windows 打包态 installDirectory 对齐当前 exe 目录（自定义安装目录防双实例）
//   - 关机/退出保护：powerMonitor shutdown + app before-quit → autoDownload = false 并取消在途下载
//   - logSink 注入：检查/下载/安装/错误事件写入 webdeck.log（与主进程链路同一落盘通道）
//   - CancellationToken 贯穿下载 + cancelDownload()（IPC updater:cancel）
// Electron 主进程 ESM 加载器不识别 CJS 的 named export，须默认导入后解构
import updaterPkg from 'electron-updater';
const { autoUpdater, NsisUpdater } = updaterPkg;
import { app, shell, ipcMain, powerMonitor } from 'electron';
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
} from './updater-policy.js';

/**
 * 创建更新服务。
 * @param {{
 *   getWindow: () => import('electron').BrowserWindow | null,
 *   logSink?: (line: string) => void,   // 落盘日志通道（fileLog.log），未注入时静默
 * }} deps
 */
export function createUpdater({ getWindow, logSink }) {
  let timer = null;
  let failures = 0;
  let started = false;
  let cancelToken = null; // 进行中下载的取消令牌（来自 checkForUpdates 结果，autoDownload=true 时驱动本次下载）
  let lastLoggedPct = -1; // 下载进度落盘节流：最近一次已写入的百分比

  const log = (line) => logSink?.(`[updater] ${line}`);

  const broadcast = (channel, payload = {}) => {
    getWindow()?.webContents.send('updater:event', { type: channel, ...payload });
  };

  function configure() {
    autoUpdater.autoDownload = true;
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
    powerMonitor.on('shutdown', () => stopDownloads('shutdown'));
    app.on('before-quit', () => stopDownloads('before-quit'));
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

  /** 启动自动检查调度（打包版 + 非 portable）。 */
  function start() {
    if (started) return;
    if (!app.isPackaged || isPortableEnv()) return; // 开发版/portable 跳过自动检查
    started = true;
    configure();
    protectShutdown();
    autoUpdater.on('checking-for-update', () => log('checking-for-update'));
    autoUpdater.on('update-available', (info) => {
      lastLoggedPct = -1; // 新一轮下载：重置进度节流
      log(`update-available version=${info?.version}`);
      broadcast('available', info);
    });
    autoUpdater.on('update-not-available', () => {
      log('update-not-available');
      broadcast('not_available');
    });
    autoUpdater.on('download-progress', (p) => {
      const pct = p?.percent ?? 0;
      if (shouldLogProgress(pct, lastLoggedPct)) {
        lastLoggedPct = pct;
        log(`download-progress ${Math.round(pct)}%`);
      }
      broadcast('download_progress', p);
    });
    autoUpdater.on('update-downloaded', (info) => {
      lastLoggedPct = -1;
      log(`update-downloaded version=${info?.version}`);
      broadcast('downloaded', info);
    });
    autoUpdater.on('update-cancelled', (info) => {
      cancelToken = null;
      lastLoggedPct = -1;
      log(`update-cancelled version=${info?.version}`);
      broadcast('cancelled', { version: info?.version });
    });
    autoUpdater.on('error', (err) => {
      log(`error ${String(err?.message ?? err)}`);
      broadcast('error', { message: String(err?.message ?? err) });
    });
    scheduleNext(INITIAL_CHECK_DELAY_MS);
  }

  /** 手动检查：明确反馈（成功/失败），不驱动退避调度。 */
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
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
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

  /** 注册更新相关 IPC（检查/安装/取消/打开下载页）。 */
  function registerIpc() {
    ipcMain.handle('updater:check', () => manualCheck());
    ipcMain.handle('updater:quit-install', () => { quitAndInstall(); return { ok: true }; });
    ipcMain.handle('updater:cancel', () => cancelDownload());
    ipcMain.handle('updater:open-download', () => { openDownloadPage(); return { ok: true }; });
  }

  return { start, manualCheck, quitAndInstall, cancelDownload, openDownloadPage, registerIpc };
}
