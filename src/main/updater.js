// updater.js — 主进程更新服务（electron-updater 封装，精简版 AppUpdaterService）
// 方案参考 Cherry Studio（调研：.tmp-cherry-research/REPORT.md）：
//   - 主进程调度：启动延迟首查 + 周期 ± 抖动 + 失败指数退避（策略见 updater-policy.js）
//   - autoInstallOnAppQuit = false：必须用户点"立即安装"
//   - Windows 未签名产物：verifyUpdateCodeSignature = false
//   - portable（PORTABLE_EXECUTABLE_DIR）与开发版不做自动检查
// Electron 主进程 ESM 加载器不识别 CJS 的 named export，须默认导入后解构
import updaterPkg from 'electron-updater';
const { autoUpdater } = updaterPkg;
import { app, shell, ipcMain } from 'electron';
import {
  CHECK_INTERVAL_MS,
  INITIAL_CHECK_DELAY_MS,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  computeBackoff,
  nextCheckDelay,
  isPortableEnv,
} from './updater-policy.js';

/**
 * 创建更新服务。
 * @param {{ getWindow: () => import('electron').BrowserWindow | null }} deps
 */
export function createUpdater({ getWindow }) {
  let timer = null;
  let failures = 0;
  let started = false;

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
    }
  }

  async function performCheck() {
    try {
      return await autoUpdater.checkForUpdates();
    } catch (err) {
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
    autoUpdater.on('update-available', (info) => broadcast('available', info));
    autoUpdater.on('update-not-available', () => broadcast('not_available'));
    autoUpdater.on('download-progress', (p) => broadcast('download_progress', p));
    autoUpdater.on('update-downloaded', (info) => broadcast('downloaded', info));
    autoUpdater.on('error', (err) => broadcast('error', { message: String(err?.message ?? err) }));
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
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  }

  /** 退化路径：macOS（未签名）/portable 等不自动安装，引导打开 Releases 下载页。 */
  function openDownloadPage() {
    shell.openExternal('https://github.com/holyshock31/webdeck/releases/latest');
  }

  /** 注册更新相关 IPC（检查/安装/打开下载页）。 */
  function registerIpc() {
    ipcMain.handle('updater:check', () => manualCheck());
    ipcMain.handle('updater:quit-install', () => { quitAndInstall(); return { ok: true }; });
    ipcMain.handle('updater:open-download', () => { openDownloadPage(); return { ok: true }; });
  }

  return { start, manualCheck, quitAndInstall, openDownloadPage, registerIpc };
}
