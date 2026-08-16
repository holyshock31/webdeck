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
  check('日志已采集', (procs.info(app.id)?.logLines ?? []).some((l) => l.includes('WEBDECK_DEMO_PORT')));
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

server.close();
console.log(failures === 0 ? '\n✅ 全部通过' : `\n❌ ${failures} 个断言失败`);
process.exit(failures === 0 ? 0 : 1);
