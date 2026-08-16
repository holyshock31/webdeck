// test-core.js — 核心逻辑单测（无需 Electron GUI）：
//   process-manager（启动/停止/日志）+ monitor（状态机）端到端验证
// 用法: node scripts/test-core.js
import { createServer } from 'node:http';
import { createProcessManager } from '../src/main/process-manager.js';
import { createMonitor } from '../src/main/monitor.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✔ ${name}`);
  else { failures++; console.error(`  ✘ ${name} ${extra}`); }
}

// 起一个真实 HTTP 服务当健康检查目标
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('ok');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const healthUrl = `http://127.0.0.1:${server.address().port}`;

// 组装：进程管理器 + 监测器（模拟 apps 注册表的最小实现）
const procs = createProcessManager();
const registry = new Map();
const statusLog = [];
const monitor = createMonitor({
  getApp: (id) => registry.get(id) ?? null,
  getProc: (id) => procs.info(id),
  setStatus: (id, status, detail) => statusLog.push({ id, status, detail }),
});
const waitStatus = async (id, want, timeoutMs = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const last = [...statusLog].reverse().find((s) => s.id === id);
    if (last && last.status === want) return last;
    await sleep(150);
  }
  return null;
};

console.log('== 测试 1: Shell 命令启动 + 健康监测 → running ==');
{
  const app = {
    id: 't1', name: 'demo', url: healthUrl,
    launch: { mode: 'shell', commandLine: `node ${path.join(__dirname, 'demo-server.js')} 0`, timeoutMs: 10000 },
    monitor: { enabled: true, url: healthUrl, intervalSec: 1, expectedStatus: 200 },
  };
  registry.set(app.id, app);
  procs.launch(app, () => {});
  monitor.start(app);
  const st = await waitStatus(app.id, 'running');
  check('状态达到 running', Boolean(st), JSON.stringify(statusLog.at(-1)));
  check('进程存活', procs.info(app.id)?.proc.exitCode === null);
  // 日志断言用短轮询：running 状态由健康检查立即触发，子进程 stdout 的 pipe
  // 数据事件可能稍后到达（CI 机器上稳定出现该竞态），轮询等待而非即时断言。
  const tLog = Date.now();
  let logCollected = false;
  while (Date.now() - tLog < 3000) {
    if ((procs.info(app.id)?.logLines ?? []).some((l) => l.includes('WEBDECK_DEMO_PORT'))) {
      logCollected = true;
      break;
    }
    await sleep(50);
  }
  check('日志已采集', logCollected);
  monitor.stop(app.id);
  await procs.stop(app);
  await sleep(500);
}

console.log('== 测试 2: 进程停止 + 健康检查失败后状态 → stopped ==');
{
  const app = registry.get('t1');
  server.close(); // 关掉健康目标：进程死了 + 健康失败 → stopped
  monitor.start(app); // 重新开启监测循环（测试 1 末尾已停）
  const lastBefore = statusLog.length;
  await procs.stop(app);
  const st = await waitStatus(app.id, 'stopped', 5000);
  check('状态变为 stopped', Boolean(st), JSON.stringify(statusLog.slice(lastBefore)));
  monitor.stop(app.id);
}


console.log('== 测试 3: 进程在跑但健康检查失败 → starting → error（超时） ==');
{
  const app = {
    id: 't3', name: 'slow', url: 'http://127.0.0.1:9', // 端口 9 无服务 → 连接失败
    launch: { mode: 'direct', command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 3000 },
    monitor: { enabled: true, url: 'http://127.0.0.1:9/health', intervalSec: 1, expectedStatus: 200 },
  };
  registry.set(app.id, app);
  procs.launch(app, () => {});
  monitor.start(app);
  const starting = await waitStatus(app.id, 'starting');
  check('先进入 starting', Boolean(starting));
  const err = await waitStatus(app.id, 'error', 8000);
  check('超时后进入 error', Boolean(err), `last=${JSON.stringify(statusLog.at(-1))}`);
  monitor.stop(app.id);
  await procs.stop(app);
}

console.log('== 测试 4: 无本地启动（纯远程）+ 健康检查失败 → error ==');
{
  const app = {
    id: 't4', name: 'remote', url: 'http://127.0.0.1:9/',
    launch: { mode: 'none' },
    monitor: { enabled: true, url: 'http://127.0.0.1:9/', intervalSec: 1, expectedStatus: 200 },
  };
  registry.set(app.id, app);
  monitor.start(app);
  const st = await waitStatus(app.id, 'error');
  check('状态为 error', Boolean(st));
  monitor.stop(app.id);
}

console.log('== 测试 5: 配置校验（normalizeApp） ==');
{
  const { normalizeApp } = await import('../src/main/apps.js');
  const a = normalizeApp({ name: 'x', url: '127.0.0.1:3080' });
  check('URL 自动补 http://', a.url === 'http://127.0.0.1:3080');
  check('监测 URL 默认 = 应用 URL', a.monitor.url === a.url);
  check('launch 默认 none', a.launch.mode === 'none');
  let threw = false;
  try { normalizeApp({ url: '' }); } catch { threw = true; }
  check('空 URL 抛错', threw);
  threw = false;
  try { normalizeApp({ url: 'http://a', launch: { mode: 'direct', command: '' } }); } catch { threw = true; }
  check('direct 无命令抛错', threw);
  const b = normalizeApp({ url: 'http://a', launch: { mode: 'shell', commandLine: 'echo hi' } });
  check('shell 模式保留', b.launch.mode === 'shell');
}

console.log('== 测试 6: 持久化往返（store + apps 集成，防回归） ==');
{
  const { createStore } = await import('../src/main/store.js');
  const { createApps } = await import('../src/main/apps.js');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'webdeck-test-'));
  try {
    // 每次「重启」都在同一目录新建 store + 注册表
    const boot = async () => {
      const store = createStore(tmpDir);
      const reg = createApps(store);
      await reg.load();
      return { store, reg };
    };

    const { reg } = await boot();
    const added = await reg.add({ name: '持久化测试', url: '127.0.0.1:3080' });
    const raw = await fs.promises.readFile(path.join(tmpDir, 'webdeck.json'), 'utf8');
    check('添加后已写盘', raw.includes(added.id), raw.slice(0, 80));

    const { reg: reg2 } = await boot();
    const afterRestart = reg2.list();
    check('重启后应用仍在', afterRestart.length === 1 && afterRestart[0].name === '持久化测试',
      JSON.stringify(afterRestart));

    await reg2.update(added.id, { name: '改名后' });
    const { reg: reg3, store: st3 } = await boot();
    check('更新后持久化', reg3.list()[0]?.name === '改名后');

    await st3.updateSettings({ lastActiveAppId: added.id }); // 恢复上次打开的应用
    await reg3.add({ name: '第二个', url: 'http://127.0.0.1:9' }); // 再增删一次，settings 不应被冲掉
    const { reg: reg4, store: st4 } = await boot();
    check('settings 随增删保留', (await st4.load()).settings.lastActiveAppId === added.id,
      JSON.stringify((await st4.load()).settings));

    await reg4.remove(added.id);
    const { reg: reg5 } = await boot();
    check('删除后持久化', reg5.list().length === 1 && reg5.list()[0].name === '第二个');
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

console.log('== 测试 7: 手动启动/停止幂等 + spawn 失败 tombstone + 重试 ==');
{
  const app7 = {
    id: 't7', name: 'idem', url: 'http://127.0.0.1:9/',
    launch: { mode: 'direct', command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 5000 },
    monitor: { enabled: true, url: 'http://127.0.0.1:9/', intervalSec: 1, expectedStatus: 200 },
  };
  registry.set(app7.id, app7);

  // 未运行 stop → false（无害 no-op）
  const r = await procs.stop(app7);
  check('未运行的 stop 返回 false', r === false);

  // 重复 launch 返回同一实例（幂等，不重复拉起）
  const first = procs.launch(app7, () => {});
  const again = procs.launch(app7, () => {});
  check('重复 launch 返回同一实例', again === first && procs.info(app7.id) === first);
  await procs.stop(app7);
  await sleep(500);

  // 退出回调只触发一次（正常退出）
  const appQuick = {
    id: 't7q', name: 'quick', url: 'http://127.0.0.1:9/',
    launch: { mode: 'direct', command: process.execPath, args: ['-e', 'process.exit(0)'], timeoutMs: 5000 },
    monitor: { enabled: false, url: 'http://127.0.0.1:9/', intervalSec: 1, expectedStatus: 200 },
  };
  registry.set(appQuick.id, appQuick);
  let quickExits = 0;
  const quickInfo = procs.launch(appQuick, () => { quickExits++; });
  const t0 = Date.now();
  while (Date.now() - t0 < 4000 && quickInfo.exitCode === null) await sleep(50);
  await sleep(300);
  check('正常退出的回调只触发一次', quickExits === 1, `exits=${quickExits}, code=${quickInfo.exitCode}`);
  check('正常退出后条目已清理', procs.info(appQuick.id) === null);

  // spawn 失败 → tombstone 保留 → 监测显示 error → 修正后重试成功
  const appBad = {
    id: 't7b', name: 'bad', url: 'http://127.0.0.1:9/',
    launch: { mode: 'direct', command: '/nonexistent/webdeck-xyz', args: [], timeoutMs: 5000 },
    monitor: { enabled: true, url: 'http://127.0.0.1:9/', intervalSec: 1, expectedStatus: 200 },
  };
  registry.set(appBad.id, appBad);
  let badExits = 0;
  procs.launch(appBad, () => { badExits++; });
  let tomb = procs.info(appBad.id);
  const t1 = Date.now();
  while (Date.now() - t1 < 4000 && !(tomb && tomb.spawnError)) { await sleep(50); tomb = procs.info(appBad.id); }
  check('spawn 失败后回调只触发一次', badExits === 1, `exits=${badExits}`);
  check('spawn 失败 tombstone 保留', Boolean(tomb?.spawnError), JSON.stringify(tomb));
  monitor.start(appBad);
  const errSt = await waitStatus(appBad.id, 'error', 5000);
  check('tombstone 下状态为 error', Boolean(errSt), JSON.stringify(statusLog.at(-1)));
  check('error 详情含失败原因', errSt?.detail?.includes('进程启动失败'), errSt?.detail);
  monitor.stop(appBad.id);
  await procs.stop(appBad); // stop 清除 tombstone
  check('stop 后 tombstone 清除', procs.info(appBad.id) === null);

  // 修正命令后重试 → 成功
  appBad.launch.command = process.execPath;
  appBad.launch.args = ['-e', 'setInterval(()=>{},1000)'];
  const retry = procs.launch(appBad, () => {});
  check('重试拿到新进程（非 tombstone）', retry !== tomb && procs.info(appBad.id) === retry);
  check('重试进程存活', procs.info(appBad.id)?.proc.exitCode === null);
  await procs.stop(appBad);
  await sleep(500);
}

console.log('== 测试 8: 启动前健康守卫（isHealthy：通过则不应再拉起实例） ==');
{
  const srv = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const healthyApp = { url, monitor: { enabled: true, url, intervalSec: 1, expectedStatus: 200, timeoutMs: 2000 } };
  check('健康通过 → isHealthy=true', await monitor.isHealthy(healthyApp) === true);
  const downApp = { url: 'http://127.0.0.1:9/', monitor: { enabled: true, url: 'http://127.0.0.1:9/', intervalSec: 1, expectedStatus: 200, timeoutMs: 2000 } };
  check('健康失败 → isHealthy=false', await monitor.isHealthy(downApp) === false);
  const offApp = { url, monitor: { enabled: false } };
  check('监测未启用 → isHealthy=false（维持原行为）', await monitor.isHealthy(offApp) === false);
  const wrongCodeApp = { url, monitor: { enabled: true, url, intervalSec: 1, expectedStatus: 404, timeoutMs: 2000 } };
  check('状态码不匹配 → isHealthy=false', await monitor.isHealthy(wrongCodeApp) === false);
  srv.close();
}

console.log('== 测试 9: 平台差异纯函数（跨平台适配，不依赖真实平台） ==');
{
  const { resolveShell, shellArgs, winTaskkillArgs, spawnDetached } = await import('../src/main/process-manager.js');
  check('win32 shell = ComSpec',
    resolveShell('win32', { ComSpec: 'C:\\Windows\\System32\\cmd.exe' }) === 'C:\\Windows\\System32\\cmd.exe');
  check('win32 无 ComSpec 回退 cmd.exe', resolveShell('win32', {}) === 'cmd.exe');
  check('POSIX shell = $SHELL', resolveShell('darwin', { SHELL: '/bin/bash' }) === '/bin/bash');
  check('POSIX 无 SHELL 回退 /bin/zsh', resolveShell('linux', {}) === '/bin/zsh');
  check('win32 shell 参数为 /d /s /c', JSON.stringify(shellArgs('win32')) === JSON.stringify(['/d', '/s', '/c']));
  check('POSIX shell 参数为 -lc', JSON.stringify(shellArgs('darwin')) === JSON.stringify(['-lc']));
  check('taskkill 温和参数（/T 不带 /F）',
    JSON.stringify(winTaskkillArgs(1234)) === JSON.stringify(['/pid', '1234', '/T']));
  check('taskkill 强制参数（/T /F）',
    JSON.stringify(winTaskkillArgs(1234, { force: true })) === JSON.stringify(['/pid', '1234', '/T', '/F']));
  check('win32 不 detached（taskkill 进程树无需进程组，且 detached 会破坏 cmd 子进程）',
    spawnDetached('win32') === false);
  check('POSIX detached（进程组信号语义需要）', spawnDetached('darwin') === true && spawnDetached('linux') === true);
}

server.close();
console.log(failures === 0 ? '\n✅ 全部通过' : `\n❌ ${failures} 个断言失败`);
process.exit(failures === 0 ? 0 : 1);
