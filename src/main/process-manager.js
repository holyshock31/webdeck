// process-manager.js — 本地命令启动/停止/日志缓冲（纯 Node，无 Electron 依赖，可单测）
// 平台差异集中在本文件：POSIX（macOS/Linux）用进程组信号；win32 用 taskkill 终止进程树。
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const MAX_LOG_LINES = 400;

// ---------------------------------------------------------------- 平台差异纯函数（可单测）

/**
 * 展开字符串中的 %VAR%（大小写不敏感）：优先查 env（忽略大小写），再查 known 映射
 * （含常见系统变量大小写变体），未知名保留原样。注册表 REG_EXPAND_SZ 值（如
 * `%appdata%\npm`、`%SYSTEMROOT%\System32\...`）展开用。
 */
export function expandEnvVars(str, env = process.env, known = {}) {
  const fallback = {
    SystemRoot: 'C:\\Windows', SYSTEMROOT: 'C:\\Windows',
    windir: 'C:\\Windows', WINDIR: 'C:\\Windows',
    ProgramFiles: 'C:\\Program Files', PROGRAMFILES: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  };
  return String(str).replace(/%([^%]+)%/g, (m, name) => {
    const envKey = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
    if (envKey !== undefined && env[envKey] !== undefined && env[envKey] !== '') return env[envKey];
    return known[name] ?? known[name.toUpperCase()] ?? known[name.toLowerCase()]
      ?? fallback[name] ?? fallback[name.toUpperCase()] ?? fallback[name.toLowerCase()] ?? m;
  });
}

/**
 * 从 Windows 注册表读取合并后的系统+用户 PATH（HKLM + HKCU），展开 %VAR%。
 * GUI 应用由 explorer 启动时，超长 PATH 可能被整体丢弃（process.env.PATH 为空），
 * 此时注册表是唯一可靠来源；cmd 终端从注册表实时合并所以正常。
 * 非 win32 或读取失败返回 null。
 */
export function readRegistryPath(env = process.env) {
  if (process.platform !== 'win32') return null;
  try {
    const query = (key) => {
      const r = spawnSync('reg', ['query', key, '/v', 'Path'], { windowsHide: true, encoding: 'utf8' });
      if (r.status !== 0) return null;
      const m = String(r.stdout).match(/^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.+)$/m);
      return m ? m[1].trim() : null;
    };
    const sys = query('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment');
    const user = query('HKCU\\Environment');
    const merged = [sys, user].filter(Boolean).join(';');
    if (!merged) return null;
    return expandEnvVars(merged, env);
  } catch { return null; }
}

/**
 * Windows 直接命令解析：按 PATH 顺序 + PATHEXT 查找可执行文件。
 * 关键：**只按 PATHEXT 扩展名拼接查找**，跳过无扩展名文件——npm 等工具生成的
 * 无扩展名 shim（如 `nodejs\dsh`）会让 libuv 原样命中后 CreateProcess 失败并
 * 直接报 ENOENT，永不继续尝试 `dsh.cmd`（诊断脚本已复现）。
 * @param {string} command 直接命令（可含路径或扩展名）
 * @param {object} env 环境（PATH/PATHEXT）
 * @param {string} baseCwd 相对路径解析基准（默认 process.cwd()）
 * @returns {{status:'ok', type:'exe'|'cmd', path:string, attempts:string[]} | {status:'notfound', attempts:string[]}}
 */
export function resolveWinCommand(command, env = process.env, baseCwd = process.cwd()) {
  const pathext = (env.PATHEXT || '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC')
    .split(';').map((s) => s.trim().toLowerCase()).filter((s) => s.startsWith('.') && s.length > 1);
  const hasSep = command.includes('\\') || command.includes('/');
  const dirs = hasSep
    ? ['']
    : [baseCwd, ...(env.PATH ?? '').split(';').map((s) => s.trim()).filter(Boolean)];
  const hasExt = path.extname(command) !== '';
  const attempts = [];
  for (const dir of dirs) {
    const base = hasSep ? command : path.join(dir, command);
    const candidates = hasExt ? [base] : pathext.map((e) => base + e);
    for (const candidate of candidates) {
      attempts.push(candidate);
      try {
        if (fs.statSync(candidate).isFile()) {
          const ext = path.extname(candidate).toLowerCase();
          return {
            status: 'ok',
            type: ext === '.exe' || ext === '.com' ? 'exe' : 'cmd',
            path: candidate,
            attempts,
          };
        }
      } catch { /* 不存在/不可访问，继续下一个候选 */ }
    }
  }
  return { status: 'notfound', attempts };
}

/** 组装 cmd.exe 命令行（/d /s /c 用）：路径与含特殊字符/空格的参数加引号，内部引号按 cmd 规则翻倍。 */
export function winCmdLine(commandPath, args = []) {
  const quote = (s) => (/[\s"&|<>^%]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  return [quote(commandPath), ...args.map(quote)].join(' ');
}

/** 按平台选择 Shell 命令模式的默认 shell。win32 用 ComSpec（cmd.exe），POSIX 用 $SHELL 或 /bin/zsh。 */
export function resolveShell(platform = process.platform, env = process.env) {
  if (platform === 'win32') return env.ComSpec || 'cmd.exe';
  return env.SHELL || '/bin/zsh';
}

/** 按平台返回 shell 的执行参数：win32 为 cmd 的 /d /s /c，POSIX 为登录 shell 的 -lc。 */
export function shellArgs(platform = process.platform) {
  return platform === 'win32' ? ['/d', '/s', '/c'] : ['-lc'];
}

/**
 * 在现有 PATH 基础上补全常见用户 bin 目录（已存在的不重复追加）。
 * 打包版从 Finder/Dock 启动时 PATH 仅为系统默认目录（/usr/bin:/bin:/usr/sbin:/sbin），
 * 不含 Homebrew / pnpm / npm-global / yarn / nvm 等用户工具路径，导致 `pnpm dsh`
 * 之类命令 spawn 失败；开发态从终端启动 PATH 完整，补全无副作用。
 */
export function resolveEnvPath(platform = process.platform, env = process.env, homedir = os.homedir()) {
  const home = homedir;
  const bins = [];
  if (platform === 'win32') {
    // 手工反斜杠拼接（path.join 会随运行平台用分隔符，纯函数测试需平台无关）
    const strip = (s) => s.replace(/[\\/]+$/, '');
    const local = strip(env.LOCALAPPDATA || '');
    const roaming = strip(env.APPDATA || '');
    const user = strip(env.USERPROFILE || home);
    bins.push(
      'C:\\Program Files\\nodejs',              // npm 全局 prefix 常见位置（dsh.cmd 等）
      local ? `${local}\\pnpm` : '',
      roaming ? `${roaming}\\npm` : '',
      `${user}\\.local\\bin`,
    );
  } else {
    bins.push(
      '/opt/homebrew/bin',                      // Apple Silicon Homebrew
      '/usr/local/bin',                         // Intel Homebrew / 传统路径
      path.join(home, '.local', 'bin'),
      path.join(home, '.local', 'share', 'pnpm'), // pnpm 全局 bin
      path.join(home, '.npm-global', 'bin'),
      path.join(home, '.yarn', 'bin'),
      path.join(home, '.bun', 'bin'),
    );
    // nvm 版本目录：~/.nvm/versions/node/<ver>/bin（版本目录可能多个，全部补上）
    try {
      const nvmRoot = path.join(home, '.nvm', 'versions', 'node');
      if (fs.existsSync(nvmRoot)) {
        for (const ver of fs.readdirSync(nvmRoot)) {
          bins.push(path.join(nvmRoot, ver, 'bin'));
        }
      }
    } catch { /* 目录不可读时忽略 */ }
  }
  const delim = platform === 'win32' ? ';' : ':';
  const current = (env.PATH ?? '').split(delim).filter(Boolean);
  const seen = new Set(current);
  const merged = [...current];
  for (const b of bins) {
    if (b && !seen.has(b)) {
      merged.push(b);
      seen.add(b);
    }
  }
  return merged.join(delim);
}

/** 构造 taskkill 参数：/pid <pid> /T 终止整棵进程树，force 时追加 /F 强杀。 */
export function winTaskkillArgs(pid, { force = false } = {}) {
  return ['/pid', String(pid), '/T', ...(force ? ['/F'] : [])];
}

/**
 * 执行 taskkill 终止 Windows 进程树，返回是否成功（exit 0）。
 * 进程不存在 / taskkill 不可用时 resolve(false)，由调用方回退。
 */
function killWinTree(pid, force = false) {
  return new Promise((resolve) => {
    const child = spawn('taskkill', winTaskkillArgs(pid, { force }), {
      windowsHide: true,
      stdio: 'ignore',
    });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

// ---------------------------------------------------------------- 进程管理

/** 按平台决定是否 detached：仅 POSIX 需要（进程组语义 + 负 PID 信号终止）。
 *  Windows 上 detached:true 会导致经 cmd /c 启动的 node 脚本不启动/无输出
 *  （复现于 GitHub windows-latest），且 Windows 终止走 taskkill /T 进程树，不需要进程组。 */
export function spawnDetached(platform = process.platform) {
  return platform !== 'win32';
}

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
    if (process.platform === 'win32' && !(env.PATH ?? '').trim()) {
      // Windows GUI 应用由 explorer 启动，超长 PATH 可能被整体丢弃（process.env.PATH 为空，
      // 典型症状：cmd 里能跑的命令 GUI 应用里 ENOENT）——从注册表合并系统+用户 PATH 兜底
      const regPath = readRegistryPath(env);
      if (regPath) env.PATH = regPath;
    }
    // GUI 启动（打包版）PATH 不完整：补全常见用户 bin 目录，保证 pnpm/node 等命令可解析
    env.PATH = resolveEnvPath(process.platform, env, os.homedir());
    const cwd = opts.cwd?.trim() ? opts.cwd.trim() : undefined;
    const stdio = ['ignore', 'pipe', 'pipe'];
    // windowsHide: 所有平台统一隐藏子进程控制台窗口（Windows 上避免每次启动闪黑窗）
    const base = { cwd, env, detached: spawnDetached(), windowsHide: true, stdio };
    const args = Array.isArray(opts.args) ? opts.args.filter(Boolean) : [];

    // 退出回调每个生命周期只触发一次（error/exit 只通知最先发生的；解析失败分支直接调用）
    const notify = (id, inf) => {
      if (inf.notified) return;
      inf.notified = true;
      onExit?.(id, inf);
    };

    const pathSnippet = (env.PATH ?? '').slice(0, 600);
    const diagTail = (env.PATH ?? '').length > 600 ? '…' : '';
    const logSpawnError = (info, msg, extra = '') => {
      const cmdLine = opts.mode === 'shell'
        ? `${resolveShell()} ${shellArgs().join(' ')} ${opts.commandLine}`
        : `${opts.command} ${args.join(' ')}`;
      pushLog(info, Buffer.from(
        `[spawn error] ${msg}\n` +
        `  command: ${cmdLine}\n` +
        `  cwd: ${cwd ?? process.cwd()}\n` +
        `  PATH: ${pathSnippet}${diagTail}\n` +
        extra,
      ));
    };

    let child;
    if (opts.mode === 'shell') {
      const shell = resolveShell();
      child = spawn(shell, [...shellArgs(), opts.commandLine], base);
    } else if (process.platform === 'win32') {
      // 直接命令：自实现解析（跳过无扩展名 shim，.cmd/.bat 经 cmd.exe 执行）
      const resolved = resolveWinCommand(opts.command, env, cwd ?? process.cwd());
      if (resolved.status !== 'ok') {
        const info = {
          proc: { pid: null, exitCode: null, kill: () => {} },
          pid: null,
          logLines: [],
          exitCode: null,
          signal: null,
          startTime: Date.now(),
          spawnError: `ENOENT: command not found: ${opts.command}`,
          notified: false,
        };
        const sample = resolved.attempts.slice(0, 5).join(', ');
        logSpawnError(info, info.spawnError,
          `  解析过程: 按 PATH+PATHEXT 尝试 ${resolved.attempts.length} 个候选均未命中（示例: ${sample}）\n`);
        procs.set(app.id, info);
        notify(app.id, info);
        return info;
      }
      if (resolved.type === 'cmd') {
        // .cmd/.bat 等：经 cmd.exe /d /s /c 执行（参数按 cmd 规则转义）
        child = spawn(resolveShell(), [...shellArgs(), winCmdLine(resolved.path, args)], base);
      } else {
        child = spawn(resolved.path, args, base);
      }
    } else {
      child = spawn(opts.command, args, base);
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

    child.stdout?.on('data', (c) => pushLog(info, c));
    child.stderr?.on('data', (c) => pushLog(info, c));
    child.on('error', (err) => {
      info.spawnError = err.message;
      // 诊断上下文：命令全文 / cwd / PATH，Windows 上 ENOENT（找不到命令）时据此定位
      // PATH 解析问题（GUI 启动的应用 PATH 快照可能与终端不同）。
      logSpawnError(info, err.message);
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

  /** 停止应用进程：未运行返回 false（无害 no-op）；spawn 失败的 tombstone 直接清除。
   *  POSIX 先 SIGTERM 整个进程组、2 秒后仍存活则 SIGKILL；win32 用 taskkill /T 终止整棵进程树。 */
  async function stop(app) {
    const info = procs.get(app.id);
    if (!info) return false;
    if (info.spawnError) {
      procs.delete(app.id); // 从未成功启动：清除失败痕迹，视为已停止
      return true;
    }

    if (process.platform === 'win32') {
      // taskkill /T /F 直接强杀整棵进程树：Windows 控制台进程（cmd/node 等无窗口进程）
      // 无法被温和终止（不带 /F 的 taskkill 对它们报"只能强制终止"），故无二段式语义。
      const ok = await killWinTree(info.proc.pid, true);
      if (!ok) {
        try { info.proc.kill(); } catch { /* already dead */ }
      }
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

  /** 停止一批应用（退出时清理用）。POSIX SIGTERM 整组；win32 taskkill /T /F 强杀整棵进程树。 */
  function stopMany(apps) {
    for (const app of apps) {
      const info = procs.get(app.id);
      if (!info) continue;
      if (process.platform === 'win32') {
        killWinTree(info.proc.pid, true);
        continue;
      }
      try { process.kill(-info.proc.pid, 'SIGTERM'); }
      catch { try { info.proc.kill('SIGTERM'); } catch { /* already dead */ } }
    }
  }

  function info(id) {
    return procs.get(id) ?? null;
  }

  return { launch, stop, stopMany, info };
}
