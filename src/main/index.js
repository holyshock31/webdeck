// index.js — WebDeck 主进程入口
import { app, BrowserWindow, Menu, shell, session, ipcMain, WebContentsView } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { createApps } from './apps.js';
import { createProcessManager } from './process-manager.js';
import { createMonitor } from './monitor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIDEBAR_WIDTH = 252;
const ALLOWED_PERMISSIONS = new Set([
  'clipboard-read', 'clipboard-sanitized-write', 'media', 'fullscreen',
  'notifications', 'openExternal', 'display-capture', 'keyboardLock',
]);

let win = null;
let apps = null;
let procs = null;
let monitor = null;
let store = null;
const views = new Map();     // appId -> WebContentsView
const statuses = new Map();  // appId -> { status, detail, updatedAt }
let activeId = null;

// ---------------------------------------------------------------- 状态

function setStatus(id, status, detail) {
  const prev = statuses.get(id);
  if (prev && prev.status === status && prev.detail === detail) return;
  statuses.set(id, { status, detail, updatedAt: Date.now() });
  win?.webContents.send('apps:status', { id, status, detail });
}

function currentStatus(id) {
  return statuses.get(id) ?? { status: 'unknown', detail: '尚未监测' };
}

// ---------------------------------------------------------------- 进程

function startAppProcess(appCfg) {
  const existing = procs.info(appCfg.id);
  if (existing && existing.proc.exitCode === null) return existing;
  setStatus(appCfg.id, 'starting', '正在启动本地服务…');
  return procs.launch(appCfg, (id, info) => {
    if (info.spawnError) {
      setStatus(id, 'error', `进程启动失败: ${info.spawnError}`);
    } else if (info.exitCode !== 0) {
      setStatus(id, 'error', `进程异常退出 (code=${info.exitCode}${info.signal ? `, signal=${info.signal}` : ''})`);
    } else {
      setStatus(id, 'stopped', '进程已退出');
    }
  });
}

async function stopAppProcess(appCfg) {
  await procs.stop(appCfg);
  setStatus(appCfg.id, 'stopped', '已停止');
  monitor.poke(appCfg.id);
}

// ---------------------------------------------------------------- 视图

function createView(appCfg) {
  const partition = `persist:webdeck-${appCfg.id}`;
  const view = new WebContentsView({
    webPreferences: {
      partition,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  view.setBackgroundColor('#ffffff');

  const ses = session.fromPartition(partition);
  if (!ses.__webdeckSetup) {
    ses.__webdeckSetup = true;
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(ALLOWED_PERMISSIONS.has(permission) || permission === 'unknown');
    });
    ses.setPermissionCheckHandler((_wc, permission) => {
      return ALLOWED_PERMISSIONS.has(permission) || permission === 'unknown';
    });
  }
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  view.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (code === -3 /* ABORTED */) return;
    setStatus(appCfg.id, 'error', `页面加载失败 (${code}) ${desc}: ${url}`);
  });
  view.webContents.on('render-process-gone', (_e, details) => {
    setStatus(appCfg.id, 'error', `渲染进程异常退出: ${details.reason}`);
  });
  return view;
}

function layoutActiveView() {
  if (!win || !activeId) return;
  const view = views.get(activeId);
  if (!view) return;
  const [w, h] = win.getContentSize();
  view.setBounds({ x: SIDEBAR_WIDTH, y: 0, width: Math.max(320, w - SIDEBAR_WIDTH), height: h });
}

function removeAllViews() {
  for (const view of views.values()) win?.contentView.removeChildView(view);
}

async function activateApp(id) {
  const appCfg = apps.get(id);
  if (!appCfg) return { ok: false, error: `应用不存在: ${id}` };

  let view = views.get(id);
  if (!view) {
    view = createView(appCfg);
    views.set(id, view);
  }
  if (activeId !== id) {
    const prev = views.get(activeId);
    if (prev) win.contentView.removeChildView(prev);
    win.contentView.addChildView(view);
    activeId = id;
    layoutActiveView();
  }
  view.webContents.loadURL(appCfg.url).catch(() => { /* did-fail-load 已上报 */ });
  view.webContents.focus();

  // 打开时按配置自动拉起本地服务
  const st = currentStatus(id).status;
  if (appCfg.startOnOpen && appCfg.launch.mode !== 'none' && ['stopped', 'error', 'unknown'].includes(st)) {
    startAppProcess(appCfg);
  }
  return { ok: true, status: currentStatus(id) };
}

// ---------------------------------------------------------------- 菜单

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const appList = apps.list();
  const appsMenu = [
    { label: '添加应用…', accelerator: 'CmdOrCtrl+N', click: () => win?.webContents.send('ui:add-app') },
    { type: 'separator' },
    ...appList.map((a, i) => ({
      label: a.name,
      accelerator: i < 9 ? `CmdOrCtrl+${i + 1}` : undefined,
      type: 'checkbox',
      checked: activeId === a.id,
      click: () => { activateApp(a.id); },
    })),
  ];
  if (appList.length === 0) appsMenu.push({ label: '（还没有应用，Cmd+N 添加）', enabled: false });

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '重新加载当前应用', accelerator: 'CmdOrCtrl+R',
          click: () => { const v = views.get(activeId); if (v) v.webContents.reload(); },
        },
        {
          label: '当前应用开发者工具', accelerator: 'CmdOrCtrl+Alt+I',
          click: () => { const v = views.get(activeId); if (v) v.webContents.openDevTools({ mode: 'detach' }); },
        },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { label: '应用', submenu: appsMenu },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [] : [{ role: 'close' }])] },
  ];
  return Menu.buildFromTemplate(template);
}

function rebuildMenu() {
  Menu.setApplicationMenu(buildMenu());
}

// ---------------------------------------------------------------- IPC

function registerIpc() {
  ipcMain.handle('apps:list', () => ({
    apps: apps.list().map((a) => ({ ...a, status: currentStatus(a.id) })),
  }));
  ipcMain.handle('apps:add', async (_e, input) => {
    const app = await apps.add(input);
    monitor.start(app);
    rebuildMenu();
    win.webContents.send('apps:changed');
    return app;
  });
  ipcMain.handle('apps:update', async (_e, id, input) => {
    const app = await apps.update(id, input);
    // 配置变化：停止旧进程，重启监测
    await procs.stop(app);
    monitor.start(app);
    rebuildMenu();
    win.webContents.send('apps:changed');
    return app;
  });
  ipcMain.handle('apps:remove', async (_e, id) => {
    const app = apps.get(id);
    if (!app) return { ok: false, error: '不存在' };
    monitor.stop(id);
    await procs.stop(app);
    const view = views.get(id);
    if (view) {
      win.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) view.webContents.close();
      views.delete(id);
    }
    if (activeId === id) activeId = null;
    const removed = await apps.remove(id);
    statuses.delete(id);
    rebuildMenu();
    win.webContents.send('apps:changed');
    return { ok: removed };
  });
  ipcMain.handle('apps:activate', (_e, id) => activateApp(id));
  ipcMain.handle('app:reload', (_e, id) => { views.get(id)?.webContents.reload(); return { ok: true }; });
  ipcMain.handle('app:start', async (_e, id) => {
    const app = apps.get(id);
    if (!app) return { ok: false, error: '不存在' };
    startAppProcess(app);
    return { ok: true };
  });
  ipcMain.handle('app:stop', async (_e, id) => {
    const app = apps.get(id);
    if (!app) return { ok: false, error: '不存在' };
    await stopAppProcess(app);
    return { ok: true };
  });
  ipcMain.handle('app:logs', (_e, id) => procs.info(id)?.logLines ?? []);
  ipcMain.handle('app:openExternal', (_e, url) => {
    if (/^https?:/i.test(String(url ?? ''))) shell.openExternal(url);
    return { ok: true };
  });
}

// ---------------------------------------------------------------- 冒烟测试（全链路 E2E）

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSmokeTest() {
  // WEBDECK_SMOKE_DSH=1 时改为直接验证真实 DSH Web UI（本机 127.0.0.1:3080）
  if (process.env.WEBDECK_SMOKE_DSH) {
    try {
      const log = (m) => console.error(`[dsh-smoke] ${m}`);
      log('step0: enter runSmokeTest');
      await sleep(800);
      log('step1: addApp via bridge');
      const cfg = {
        name: 'DSH Smoke',
        url: 'http://127.0.0.1:3080',
        launch: { mode: 'none' },
        monitor: { enabled: true, url: 'http://127.0.0.1:3080', intervalSec: 2, expectedStatus: 200 },
      };
      const appCfg = await win.webContents.executeJavaScript(`webdeck.addApp(${JSON.stringify(cfg)})`, true);
      log('step2: activate');
      await win.webContents.executeJavaScript(`webdeck.activateApp('${appCfg.id}')`, true);
      const view = views.get(appCfg.id);
      log('step3: wait load');
      const loaded = await new Promise((resolve) => {
        const t = setTimeout(() => resolve(false), 15000);
        view.webContents.once('did-finish-load', () => { clearTimeout(t); resolve(true); });
        view.webContents.once('did-fail-load', (_e, code, desc) => { clearTimeout(t); resolve(`fail:${code}:${desc}`); });
      });
      log(`step4: loaded=${JSON.stringify(loaded)}`);
      await sleep(2500);
      const data = await win.webContents.executeJavaScript('webdeck.listApps()', true);
      const status = data.apps.find((a) => a.id === appCfg.id)?.status?.status;
      const title = view.webContents.getTitle();
      log(`final loaded=${JSON.stringify(loaded)} status=${status} title=${JSON.stringify(title)}`);
      await win.webContents.executeJavaScript(`webdeck.removeApp('${appCfg.id}')`, true);
      const ok = loaded === true && status === 'running';
      console.log(ok ? 'SMOKE_OK' : 'SMOKE_FAIL');
      app.exit(ok ? 0 : 1);
    } catch (err) {
      console.error('SMOKE_FAIL:', err);
      app.exit(1);
    }
    return;
  }

  const { spawn } = await import('node:child_process');
  const demoPort = 32188;
  const demoServer = path.join(__dirname, '../../scripts/demo-server.js');

  try {
    // 1. 等 UI 渲染层就绪，并确认 app.js 真实执行（侧边栏空态已渲染）
    await sleep(800);
    const uiOk = await win.webContents.executeJavaScript(
      `document.querySelector('#sidebar-header') !== null && document.querySelector('.empty-list') !== null`,
      true,
    );
    console.log(`SMOKE_UI ui=${uiOk}`);

    // 2. 通过真实 IPC 桥添加应用（Shell 启动方式 + 监测）
    const cfg = {
      name: 'Smoke Demo',
      url: `http://127.0.0.1:${demoPort}`,
      launch: { mode: 'shell', commandLine: `${process.execPath} ${demoServer} ${demoPort}`, timeoutMs: 15000 },
      monitor: { enabled: true, url: `http://127.0.0.1:${demoPort}/health`, intervalSec: 2, expectedStatus: 200 },
    };
    const appCfg = await win.webContents.executeJavaScript(`webdeck.addApp(${JSON.stringify(cfg)})`, true);
    const appId = appCfg.id;
    await win.webContents.executeJavaScript(`webdeck.activateApp('${appId}')`, true);

    // 3. 轮询状态：starting → running（等待 Shell 拉起 demo 服务）
    let finalStatus = null;
    for (let i = 0; i < 20 && finalStatus !== 'running'; i++) {
      await sleep(1000);
      const data = await win.webContents.executeJavaScript('webdeck.listApps()', true);
      finalStatus = data.apps.find((a) => a.id === appId)?.status?.status ?? null;
    }
    console.log(`SMOKE_LAUNCH status=${finalStatus}`);

    // 4. 停止服务 → stopped
    await win.webContents.executeJavaScript(`webdeck.stopApp('${appId}')`, true);
    await sleep(2500);
    const data2 = await win.webContents.executeJavaScript('webdeck.listApps()', true);
    const stoppedStatus = data2.apps.find((a) => a.id === appId)?.status?.status ?? null;
    console.log(`SMOKE_STOP status=${stoppedStatus}`);

    // 5. 移除应用
    await win.webContents.executeJavaScript(`webdeck.removeApp('${appId}')`, true);

    const ok = finalStatus === 'running' && stoppedStatus === 'stopped';
    console.log(ok ? 'SMOKE_OK' : 'SMOKE_FAIL');
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('SMOKE_FAIL:', err);
    app.exit(1);
  }
}

// ---------------------------------------------------------------- 生命周期

async function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 600,
    title: 'WebDeck',
    backgroundColor: '#14161c',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.on('resize', layoutActiveView);
  win.on('closed', () => { win = null; });
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[webdeck] UI renderer crashed:', details.reason);
  });
}

app.whenReady().then(async () => {
  const dbg = (m) => console.error(`[boot] ${m}`);
  dbg('ready: create store');
  store = createStore(app.getPath('userData'));
  apps = createApps(store);
  await apps.load();
  dbg(`ready: apps loaded (${apps.list().length})`);
  procs = createProcessManager();
  monitor = createMonitor({
    getApp: (id) => apps.get(id),
    getProc: (id) => procs.info(id),
    setStatus,
  });

  for (const appCfg of apps.list()) monitor.start(appCfg);

  registerIpc(); // 先注册 IPC，渲染进程加载后会立即调用
  dbg('ready: ipc registered');
  await createWindow();
  dbg('ready: window created');
  rebuildMenu();

  const lastId = (await store.load()).settings.lastActiveAppId;
  const first = apps.list()[0];
  if (lastId && apps.get(lastId)) await activateApp(lastId);
  else if (first) await activateApp(first.id);

  if (process.env.WEBDECK_SMOKE || process.env.WEBDECK_SMOKE_DSH) {
    await runSmokeTest();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  if (apps) {
    try {
      const data = apps.list();
      procs?.stopMany(data.filter((a) => a.launch?.stopOnQuit !== false));
      monitor?.stopAll();
    } catch { /* ignore */ }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
