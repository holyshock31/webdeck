// monitor.js — 健康监测状态机（纯 Node，无 Electron 依赖，可单测）
//
// 状态：unknown → stopped / starting → running | error
//  - running ：健康检查通过
//  - starting：本地进程已启动、健康检查未通过，且未超时
//  - error   ：启动超时 / 进程异常退出 / 健康检查持续失败
//  - stopped ：未启动（或进程正常退出）

const MIN_INTERVAL_MS = 2000;

/**
 * @param {object} deps
 * @param {(id: string) => object|null} deps.getApp 取规范化应用配置
 * @param {(id: string) => object|null} deps.getProc 取进程信息（process-manager.info）
 * @param {(id: string, status: string, detail: string) => void} deps.setStatus 状态回调
 */
export function createMonitor({ getApp, getProc, setStatus }) {
  const timers = new Map(); // appId -> interval

  async function probe(url, timeoutMs) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res.status;
    } catch {
      return null;
    }
  }

  async function tick(id) {
    const app = getApp(id);
    if (!app || !app.monitor?.enabled) return;

    const healthUrl = app.monitor.url || app.url;
    const expected = app.monitor.expectedStatus ?? 200;
    const timeoutMs = app.monitor.timeoutMs ?? 3000;
    const statusCode = await probe(healthUrl, timeoutMs);

    const proc = getProc(id);
    const hasLaunch = app.launch?.mode !== 'none';
    const procAlive = Boolean(proc && proc.proc.exitCode === null);
    const launchTimeout = app.launch?.timeoutMs ?? 30000;

    let status;
    let detail;
    if (statusCode !== null && statusCode === expected) {
      status = 'running';
      detail = `健康检查通过 (${statusCode}, ${healthUrl})`;
    } else if (hasLaunch && procAlive) {
      const elapsed = Date.now() - proc.startTime;
      if (elapsed > launchTimeout) {
        status = 'error';
        detail = `启动超时：进程已运行 ${Math.round(elapsed / 1000)}s 但健康检查未通过 (${healthUrl})`;
      } else {
        status = 'starting';
        detail = '等待服务就绪…';
      }
    } else if (hasLaunch) {
      status = 'stopped';
      detail = '本地服务未启动';
    } else {
      status = statusCode === null ? 'error' : 'error';
      detail = statusCode === null
        ? `健康检查失败，无法访问 ${healthUrl}`
        : `健康检查异常状态码 ${statusCode}（期望 ${expected}）`;
    }
    setStatus(id, status, detail);
  }

  /** 开始（或重启）一个应用的监测循环。 */
  function start(app) {
    stop(app.id);
    const intervalMs = Math.max(MIN_INTERVAL_MS, (app.monitor?.intervalSec ?? 5) * 1000);
    const timer = setInterval(() => tick(app.id), intervalMs);
    timers.set(app.id, timer);
    tick(app.id);
  }

  /** 立即探测一次（不依赖循环）。 */
  function poke(id) {
    return tick(id);
  }

  function stop(id) {
    const timer = timers.get(id);
    if (timer) {
      clearInterval(timer);
      timers.delete(id);
    }
  }

  function stopAll() {
    for (const timer of timers.values()) clearInterval(timer);
    timers.clear();
  }

  return { start, stop, stopAll, poke };
}
