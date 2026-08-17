// updater-policy.js — 更新调度策略纯函数（无 electron 依赖，可单测）
// 方案参考 Cherry Studio（调研：.tmp-cherry-research/REPORT.md）

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
