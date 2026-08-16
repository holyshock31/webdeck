// process-manager.js — 本地命令启动/停止/日志缓冲（纯 Node，无 Electron 依赖，可单测）
import { spawn } from 'node:child_process';

const MAX_LOG_LINES = 400;

/**
 * @returns {{ launch(app, onExit): object, stop(app): Promise<boolean>, stopMany(apps): void, info(id): object|null }}
 */
export function createProcessManager() {
  const procs = new Map(); // appId -> { proc, pid, logLines, exitCode, signal, startTime, spawnError }

  function pushLog(info, chunk) {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      info.logLines.push(line);
      if (info.logLines.length > MAX_LOG_LINES) info.logLines.shift();
    }
  }

  /**
   * 启动一个应用的本地进程。已在运行则直接返回现有实例（幂等，不重复拉起）；
   * 上一次 spawn 失败（tombstone）时不阻塞重试，直接替换为新进程。
   * @param {object} app 规范化后的应用配置（含 launch）
   * @param {(appId: string, info: object) => void} onExit 进程退出回调
   */
  function launch(app, onExit) {
    const existing = procs.get(app.id);
    if (existing && existing.proc.exitCode === null && !existing.spawnError) return existing;

    const opts = app.launch;
    const env = { ...process.env, ...(opts.env ?? {}) };
    const cwd = opts.cwd?.trim() ? opts.cwd.trim() : undefined;
    const stdio = ['ignore', 'pipe', 'pipe'];

    let child;
    if (opts.mode === 'shell') {
      const shell = process.env.SHELL || '/bin/zsh';
      child = spawn(shell, ['-lc', opts.commandLine], { cwd, env, detached: true, stdio });
    } else {
      const args = Array.isArray(opts.args) ? opts.args.filter(Boolean) : [];
      child = spawn(opts.command, args, { cwd, env, detached: true, stdio });
    }

    const info = {
      proc: child,
      pid: child.pid,
      logLines: [],
      exitCode: null,
      signal: null,
      startTime: Date.now(),
      spawnError: null,
      notified: false, // 退出回调每个生命周期只触发一次（error/exit 只通知最先发生的）
    };
    procs.set(app.id, info);

    const notify = (id, inf) => {
      if (inf.notified) return;
      inf.notified = true;
      onExit?.(id, inf);
    };

    child.stdout?.on('data', (c) => pushLog(info, c));
    child.stderr?.on('data', (c) => pushLog(info, c));
    child.on('error', (err) => {
      info.spawnError = err.message;
      pushLog(info, Buffer.from(`[spawn error] ${err.message}\n`));
      // 保留 tombstone（不删条目）：监测层据此显示 error，且再次 launch 可直接重试
      notify(app.id, info);
    });
    child.on('exit', (code, signal) => {
      info.exitCode = code;
      info.signal = signal;
      // spawn 失败的 tombstone 保留到 stop/下次 launch，避免状态翻回 stopped
      if (!info.spawnError) procs.delete(app.id);
      notify(app.id, info);
    });

    return info;
  }

  /** 停止应用进程：先 SIGTERM 整个进程组，2 秒后仍存活则 SIGKILL。
   *  未运行返回 false（无害 no-op）；spawn 失败的 tombstone 直接清除。 */
  async function stop(app) {
    const info = procs.get(app.id);
    if (!info) return false;
    if (info.spawnError) {
      procs.delete(app.id); // 从未成功启动：清除失败痕迹，视为已停止
      return true;
    }
    const group = info.proc.pid;
    const killGroup = (sig) => {
      try { process.kill(-group, sig); return true; }
      catch { try { info.proc.kill(sig); return true; } catch { return false; } }
    };
    killGroup('SIGTERM');
    setTimeout(() => {
      const again = procs.get(app.id);
      if (again && again.proc.exitCode === null) killGroup('SIGKILL');
    }, 2000);
    return true;
  }

  /** 停止一批应用（退出时清理用，仅 SIGTERM）。 */
  function stopMany(apps) {
    for (const app of apps) {
      const info = procs.get(app.id);
      if (!info) continue;
      try { process.kill(-info.proc.pid, 'SIGTERM'); }
      catch { try { info.proc.kill('SIGTERM'); } catch { /* already dead */ } }
    }
  }

  function info(id) {
    return procs.get(id) ?? null;
  }

  return { launch, stop, stopMany, info };
}
