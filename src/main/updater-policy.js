// updater-policy.js — 更新调度策略纯函数（无 electron 依赖，可单测）
// 方案参考 Cherry Studio（调研：.tmp-cherry-research/REPORT.md）
import path from 'node:path';

export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
export const CHECK_JITTER_RATIO = 0.15;              // ±15% 抖动
export const INITIAL_CHECK_DELAY_MS = 5000;          // 启动 5s 后首查
export const RETRY_BASE_MS = 5 * 60 * 1000;          // 退避基数 5min
export const RETRY_MAX_MS = 60 * 60 * 1000;          // 退避封顶 60min

/** 指数退避（纯函数）：base * 2^(failures-1)，封顶 max。 */
export function computeBackoff(baseMs, maxMs, failures) {
  const delay = baseMs * 2 ** (failures - 1);
  return Math.min(delay, maxMs);
}

/** 下次检查延迟：interval ± jitterRatio 随机抖动（rand 可注入）。 */
export function nextCheckDelay(intervalMs, rand = Math.random) {
  return Math.round(intervalMs * (1 + (rand() * 2 - 1) * CHECK_JITTER_RATIO));
}

/** portable 判定：electron-builder portable 会设置 PORTABLE_EXECUTABLE_DIR。 */
export function isPortableEnv() {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
}

/**
 * Windows 打包态更新安装目录（纯函数）：对齐当前 exe 所在目录，
 * 防止用户自定义安装目录后更新装回默认目录造成双实例。
 * 非 Windows / 开发态（exe 为 electron 二进制）返回 null → 跳过对齐。
 */
export function installDirectoryFor(platform, isPackaged, exePath) {
  if (platform !== 'win32' || !isPackaged || !exePath) return null;
  // win32 语义解析（测试可在任意宿主平台跑）：Windows 运行时等价于默认 path.dirname
  return path.win32.dirname(exePath);
}

/**
 * 下载进度落盘节流（纯函数）：跨 0/25/50/75/100 里程碑才记录，
 * 避免每个 progress 事件（高频）都写日志刷爆 webdeck.log。
 * percent 为当前百分比（0-100），lastLoggedPercent 为上次已记录的百分比（默认 -1）。
 */
export function shouldLogProgress(percent, lastLoggedPercent = -1) {
  const milestone = Math.floor(percent / 25) * 25;
  const lastMilestone = Math.floor((lastLoggedPercent ?? -1) / 25) * 25;
  return milestone > lastMilestone;
}
