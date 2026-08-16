// apps.js — 应用注册表：配置规范化、增删改查、持久化（纯 Node，无 Electron 依赖）
import { randomUUID } from 'node:crypto';

export const DEFAULT_LAUNCH = {
  mode: 'none',        // 'none' | 'direct' | 'shell'
  command: '',         // direct: 可执行文件或脚本路径
  args: [],            // direct: 参数数组
  commandLine: '',     // shell: 整条命令（如 cd ~/x && pnpm dsh）
  cwd: '',             // 工作目录（空 = 继承 WebDeck）
  env: {},             // 额外环境变量
  waitForUrl: true,    // 等待健康检查通过后才标记 running
  timeoutMs: 30000,    // 启动超时
  stopOnQuit: true,    // 退出 WebDeck 时结束该进程
};

export const DEFAULT_MONITOR = {
  enabled: true,       // 是否启用健康监测
  url: '',             // 健康检查 URL（空 = 应用 URL）
  intervalSec: 5,
  expectedStatus: 200,
  timeoutMs: 3000,
};

/**
 * 校验并规范化应用配置（前后端共用同一套规则）。
 * @param {object} input 原始表单输入
 * @param {string} [id] 已有应用的 id（更新时传入）
 */
export function normalizeApp(input, id) {
  const url = String(input?.url ?? '').trim();
  if (!url) throw new Error('URL 不能为空');

  let fullUrl = url;
  if (!/^https?:\/\//i.test(fullUrl)) fullUrl = `http://${fullUrl}`;
  try {
    // eslint-disable-next-line no-new
    new URL(fullUrl);
  } catch {
    throw new Error(`URL 无效: ${fullUrl}`);
  }

  const launch = { ...DEFAULT_LAUNCH, ...(input.launch ?? {}) };
  if (launch.mode !== 'direct' && launch.mode !== 'shell') launch.mode = 'none';
  if (launch.mode === 'direct' && !String(launch.command ?? '').trim()) {
    throw new Error('启动方式为「直接命令」时必须填写可执行文件');
  }
  if (launch.mode === 'shell' && !String(launch.commandLine ?? '').trim()) {
    throw new Error('启动方式为「Shell 命令」时必须填写命令');
  }
  launch.args = Array.isArray(launch.args) ? launch.args.filter((a) => String(a).trim() !== '') : [];
  launch.env = launch.env && typeof launch.env === 'object' && !Array.isArray(launch.env) ? launch.env : {};
  launch.timeoutMs = Number.isFinite(launch.timeoutMs) && launch.timeoutMs > 0 ? launch.timeoutMs : DEFAULT_LAUNCH.timeoutMs;

  const monitor = { ...DEFAULT_MONITOR, ...(input.monitor ?? {}) };
  if (monitor.url) {
    const mUrl = String(monitor.url).trim();
    monitor.url = /^https?:\/\//i.test(mUrl) ? mUrl : `http://${mUrl}`;
  } else {
    monitor.url = fullUrl;
  }
  monitor.intervalSec = Number.isFinite(monitor.intervalSec) && monitor.intervalSec >= 1 ? monitor.intervalSec : DEFAULT_MONITOR.intervalSec;
  monitor.expectedStatus = Number.isFinite(monitor.expectedStatus) ? monitor.expectedStatus : DEFAULT_MONITOR.expectedStatus;
  monitor.timeoutMs = Number.isFinite(monitor.timeoutMs) && monitor.timeoutMs > 0 ? monitor.timeoutMs : DEFAULT_MONITOR.timeoutMs;
  monitor.enabled = monitor.enabled !== false;

  return {
    id: id ?? randomUUID(),
    name: String(input.name ?? '').trim() || fullUrl,
    url: fullUrl,
    icon: String(input.icon ?? '').trim(),  // 可选：图标（渲染层相对路径 / 绝对路径 / http(s) URL）
    launch,
    monitor,
    startOnOpen: input.startOnOpen !== false,
    createdAt: input.createdAt ?? Date.now(),
  };
}

export function createApps(store) {
  let apps = []; // 顺序即侧边栏顺序

  async function load() {
    const data = await store.load();
    apps = (data.apps ?? []).map((a) => {
      try { return normalizeApp(a, a.id); } catch { return null; }
    }).filter(Boolean);
    return apps;
  }

  function list() {
    return apps;
  }

  function get(id) {
    return apps.find((a) => a.id === id) ?? null;
  }

  /** 把当前应用数组 + settings 一起落盘（apps 数组与 store 缓存是不同引用，必须整体传）。 */
  async function persist() {
    const data = await store.load();
    await store.save({ apps, settings: data.settings ?? {} });
  }

  async function add(input) {
    const app = normalizeApp(input);
    apps.push(app);
    await persist();
    return app;
  }

  /** 整体替换一个应用的配置（表单提交全量）。 */
  async function update(id, input) {
    const idx = apps.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error(`应用不存在: ${id}`);
    const app = normalizeApp({ ...apps[idx], ...input }, id);
    apps[idx] = app;
    await persist();
    return app;
  }

  async function remove(id) {
    const idx = apps.findIndex((a) => a.id === id);
    if (idx < 0) return false;
    apps.splice(idx, 1);
    await persist();
    return true;
  }

  function save() {
    return persist();
  }

  return { load, list, get, add, update, remove, save };
}
