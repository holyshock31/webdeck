// index.js — WebDeck 主进程入口
import { app, BrowserWindow, Menu, shell, session, ipcMain, WebContentsView } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { createApps } from './apps.js';
import { createProcessManager } from './process-manager.js';
import { createMonitor } from './monitor.js';
import { createFileLogger } from './file-logger.js';
import { createUpdater } from './updater.js';
import { createFindSession } from './find.js';

// 应用身份声明：直接 `electron .` 开发态运行时，进程/任务栏身份默认取自 Electron
// 二进制。这里显式声明项目名（Windows 任务栏与通知按 AppUserModelID 归属；
// macOS Dock 悬停名不受此控制，见 scripts/dev.sh 的改名 .app 副本方案）。
// AppUserModelID 与打包 appId（com.webdeck.app）及 dev.sh 的 CFBundleIdentifier 保持一致，
// 保证 Windows 任务栏/通知归属在开发态与打包态统一。
app.setName('WebDeck');
app.setAppUserModelId('com.webdeck.app');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ICON = path.join(__dirname, '../../assets/icon.png');
const SIDEBAR_WIDTH = 252;
const EXPAND_BTN_W = 22;   // 浮动展开按钮覆盖视图尺寸（窗口左缘，收起态显示）
const EXPAND_BTN_H = 52;
const FIND_BAR_W = 400;    // 页内查找栏覆盖视图尺寸（内容区右上角，仅查找栏区域不透明）
const FIND_BAR_H = 52;
const ALLOWED_PERMISSIONS = new Set([
  'clipboard-read', 'clipboard-sanitized-write', 'media', 'fullscreen',
  'notifications', 'openExternal', 'display-capture', 'keyboardLock',
]);

let win = null;
let apps = null;
let procs = null;
let monitor = null;
let store = null;
let fileLog = null;            // 落盘日志（userData/logs/webdeck.log），GUI 打包版查看链路日志的途径
let updater = null;            // 更新服务（electron-updater 封装，打包版自动检查）
const views = new Map();     // appId -> WebContentsView
const statuses = new Map();  // appId -> { status, detail, updatedAt }
let activeId = null;
let modalOpen = false;       // 弹窗打开时隐藏 WebContentsView（原生视图会遮挡 HTML 弹窗）
let sidebarCollapsed = false; // 侧边栏收起态（持久化于 settings.sidebarCollapsed，缺失默认展开）
let autoUpdateEnabled = true; // 更新偏好开关（持久化于 settings.autoUpdateEnabled，缺失默认开，帮助菜单控制）
let expandView = null;        // 收起态下窗口左缘的浮动展开按钮（原生覆盖视图，盖在应用视图之上）
let findView = null;          // 页内查找栏覆盖视图（原生覆盖视图，盖在应用视图之上）
let findViewVisible = false;  // 查找栏可见性跟踪（WebContentsView 无 isVisible()，需自行维护）
const findSession = createFindSession(); // 页内查找会话状态机（纯逻辑，可单测）

// ---------------------------------------------------------------- 状态

function setStatus(id, status, detail) {
  const prev = statuses.get(id);
  if (prev && prev.status === status && prev.detail === detail) return;
  statuses.set(id, { status, detail, updatedAt: Date.now() });
  win?.webContents.send('apps:status', { id, status, detail });
  // [judge] 链节：状态判定结果写入该应用的日志（面板可见 + 落盘）
  const info = procs?.info?.(id);
  if (info) {
    info.logLines.push(`[judge] status=${status} detail=${detail}`);
    if (info.logLines.length > 400) info.logLines.shift();
    fileLog?.log(`[judge] app=${id} status=${status} detail=${detail}`);
  }
}

function currentStatus(id) {
  return statuses.get(id) ?? { status: 'unknown', detail: '尚未监测' };
}

// ---------------------------------------------------------------- 进程

function startAppProcess(appCfg, trigger = 'manual') {
  const existing = procs.info(appCfg.id);
  if (existing && existing.proc.exitCode === null && !existing.signal && !existing.spawnError) return existing;
  setStatus(appCfg.id, 'starting', '正在启动本地服务…');
  return procs.launch(appCfg, (id, info) => {
    if (info.spawnError) {
      setStatus(id, 'error', `进程启动失败: ${info.spawnError}`);
    } else if (info.exitCode !== 0) {
      setStatus(id, 'error', `进程异常退出 (code=${info.exitCode}${info.signal ? `, signal=${info.signal}` : ''})`);
    } else {
      setStatus(id, 'stopped', '进程已退出');
    }
  }, { trigger });
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
  // 页内查找：命中计数回报转发给查找栏（仅激活视图的会话）
  view.webContents.on('found-in-page', (_e, result) => {
    if (activeId !== appCfg.id || !findSession.isOpen()) return;
    findSession.setResult(result);
    if (findView && !findView.webContents.isDestroyed()) {
      findView.webContents.send('find:result', {
        matches: result.matches,
        activeMatchOrdinal: result.activeMatchOrdinal,
      });
    }
  });
  // 页面导航/重载后查找状态失效：关闭查找栏并清除该视图高亮
  view.webContents.on('did-navigate', () => {
    if (activeId === appCfg.id) closeFindBar(view);
  });
  return view;
}

function layoutActiveView() {
  if (!win || !activeId) return;
  const view = views.get(activeId);
  if (!view) return;
  const [w, h] = win.getContentSize();
  if (sidebarCollapsed) {
    // 收起态：应用视图占满整个窗口
    view.setBounds({ x: 0, y: 0, width: w, height: h });
  } else {
    view.setBounds({ x: SIDEBAR_WIDTH, y: 0, width: Math.max(320, w - SIDEBAR_WIDTH), height: h });
  }
  layoutExpandView();
  layoutFindView(); // 窗口尺寸变化时查找栏跟随（仅可见时更新位置）
}

// 浮动展开按钮：仅在收起态且无弹窗时显示，垂直居中于窗口左缘
function layoutExpandView() {
  if (!win || !expandView) return;
  const show = sidebarCollapsed && !modalOpen;
  if (!show) {
    expandView.setVisible(false);
    return;
  }
  const [, h] = win.getContentSize();
  expandView.setBounds({
    x: 0,
    y: Math.round(h / 2 - EXPAND_BTN_H / 2),
    width: EXPAND_BTN_W,
    height: EXPAND_BTN_H,
  });
  expandView.setVisible(true);
}

// 重新把浮动按钮提升到 contentView 最上层（应用视图 addChildView 会追加到顶层，需再抬升）
function raiseExpandView() {
  if (!win || !expandView) return;
  win.contentView.removeChildView(expandView);
  win.contentView.addChildView(expandView);
}

// 浮动展开按钮跟随壳主题：按钮页面通过 query 参数注入主题，主题切换时重载
function reloadExpandView(theme) {
  if (!expandView) return;
  expandView.webContents
    .loadFile(path.join(__dirname, '../renderer/expand-button.html'), {
      query: { theme: theme === 'light' ? 'light' : 'dark' },
    })
    .catch(() => { /* 本地文件加载失败可忽略 */ });
}

// ---------------------------------------------------------------- 页内查找

// 查找栏覆盖视图布局：锚定在内容区右上角（侧边栏之外），不遮挡应用页面主要内容
// 窗口宽度下限 920px > 查找栏 400px + 边距，x 恒为正，无需 clamp
function layoutFindView() {
  if (!win || !findView) return;
  const [w] = win.getContentSize();
  const left = sidebarCollapsed ? 0 : SIDEBAR_WIDTH;
  findView.setBounds({
    x: Math.max(left, w - FIND_BAR_W - 12),
    y: 8,
    width: FIND_BAR_W,
    height: FIND_BAR_H,
  });
}

// 把查找栏抬升到 contentView 最上层（应用视图 addChildView 会追加到顶层，需再抬升）
function raiseFindView() {
  if (!win || !findView) return;
  win.contentView.removeChildView(findView);
  win.contentView.addChildView(findView);
}

// 聚焦查找栏输入框（页面可能尚未加载完成，失败静默）
function focusFindInput(select) {
  if (!findView || findView.webContents.isDestroyed()) return;
  findView.webContents.focus();
  findView.webContents.executeJavaScript(
    `const i = document.getElementById('find-input'); if (i) { i.focus();${select ? ' i.select();' : ''} }`,
    true,
  ).catch(() => { /* 页面未加载完成时忽略 */ });
}

// 查找栏显隐：会话打开、无弹窗遮挡、且有激活应用时显示，否则隐藏
// （WebContentsView 无 isVisible()，可见性由 findViewVisible 自行维护）
function updateFindViewVisibility() {
  if (!win || !findView) return;
  const show = findSession.isOpen() && !modalOpen && Boolean(views.get(activeId));
  if (show) {
    raiseFindView();
    layoutFindView();
    if (!findViewVisible) {
      findView.setVisible(true);
      findViewVisible = true;
      focusFindInput(false); // 恢复显示（如弹窗关闭后）时重新聚焦输入框
    }
  } else if (findViewVisible) {
    findView.setVisible(false);
    findViewVisible = false;
  }
}

// 打开查找栏：菜单 ⌘F 入口；已打开时再次触发仅聚焦输入框（选中已有内容，便于直接重输）
function openFindBar() {
  if (!activeId || !findView) return;
  findSession.open();
  updateFindViewVisibility();
  if (findViewVisible) focusFindInput(true);
}

// 关闭查找栏：清空会话与计数、清除指定视图的高亮、交还焦点给应用视图
// clearView 传空时只关闭查找栏（不主动清任何视图的高亮）
function closeFindBar(clearView) {
  if (!findSession.isOpen()) return;
  findSession.close();
  if (clearView && !clearView.webContents.isDestroyed()) {
    clearView.webContents.stopFindInPage('clearSelection');
  }
  if (findView && !findView.webContents.isDestroyed()) findView.webContents.send('find:reset');
  updateFindViewVisibility();
  const v = views.get(activeId);
  if (v && !v.webContents.isDestroyed()) v.webContents.focus();
  else win?.webContents.focus();
}

// 查找栏跟随壳主题：theme query 注入；重载完成后把会话状态同步回栏内（主题切换不丢输入/计数）
function reloadFindView(theme) {
  if (!findView) return;
  findView.webContents
    .loadFile(path.join(__dirname, '../renderer/find-bar.html'), {
      query: { theme: theme === 'light' ? 'light' : 'dark' },
    })
    .then(() => {
      const s = findSession.state;
      findView?.webContents.send('find:sync', {
        open: s.open,
        query: s.query,
        matches: s.matches,
        activeMatchOrdinal: s.activeMatchOrdinal,
      });
    })
    .catch(() => { /* 本地文件加载失败可忽略 */ });
}

// 翻找一步：find:next / find:prev IPC 与菜单 ⌘G / ⇧⌘G 共用；会话未打开或空 query 时为无害 no-op
function findStep(forward) {
  const v = views.get(activeId);
  if (!v || !findSession.isOpen()) return { ok: false };
  const r = findSession.step(forward);
  if (r.action === 'search') v.webContents.findInPage(findSession.state.query, r.options);
  return { ok: true };
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
    closeFindBar(prev); // 切换应用：关闭查找栏并清除旧视图高亮
    if (prev) win.contentView.removeChildView(prev);
    win.contentView.addChildView(view);
    raiseExpandView(); // 应用视图追加到顶层后，把浮动展开按钮抬回最上层
    activeId = id;
    layoutActiveView();
  }
  view.setVisible(!modalOpen); // 弹窗打开期间保持隐藏，避免遮挡模态框
  view.webContents.loadURL(appCfg.url).catch(() => { /* did-fail-load 已上报 */ });
  view.webContents.focus();

  // 打开时按配置自动拉起本地服务
  const st = currentStatus(id).status;
  if (appCfg.startOnOpen && appCfg.launch.mode !== 'none' && ['stopped', 'error', 'unknown'].includes(st)) {
    // 健康检查已通过（服务可能在外部已启动）→ 不再拉起实例，直接标记运行中
    if (await monitor.isHealthy(appCfg)) {
      setStatus(id, 'running', '健康检查通过，服务已在运行');
    } else {
      startAppProcess(appCfg, 'auto');
    }
  }

  // 记住最近打开的应用，重启后恢复
  store?.updateSettings({ lastActiveAppId: id });

  // 通知渲染层同步激活态（启动自动激活/菜单切换时，工具栏与高亮才能跟随）
  win?.webContents.send('apps:activated', { id, status: currentStatus(id) });

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
        { type: 'separator' },
        { label: '在页面中查找…', accelerator: 'CmdOrCtrl+F', click: () => openFindBar() },
        { label: '查找下一处', accelerator: 'CmdOrCtrl+G', click: () => findStep(true) },
        { label: '查找上一处', accelerator: 'CmdOrCtrl+Shift+G', click: () => findStep(false) },
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
          label: '壳 UI 开发者工具', accelerator: 'CmdOrCtrl+Shift+I',
          click: () => win?.webContents.openDevTools({ mode: 'detach' }),
        },
        {
          label: '当前应用开发者工具', accelerator: 'CmdOrCtrl+Alt+I',
          click: () => { const v = views.get(activeId); if (v) v.webContents.openDevTools({ mode: 'detach' }); },
        },
        { type: 'separator' },
        {
          label: '收起 / 展开侧边栏', accelerator: 'CmdOrCtrl+\\',
          click: () => win?.webContents.send('ui:toggle-sidebar'),
        },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { label: '应用', submenu: appsMenu },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [] : [{ role: 'close' }])] },
    {
      label: '帮助',
      submenu: [
        { role: 'about' },
        {
          label: '检查更新…',
          click: () => win?.webContents.send('ui:check-update'),
        },
        { type: 'separator' },
        {
          // 自动检查开关：关闭后调度循环空转（不再自动检查），手动「检查更新」不受影响
          label: '自动检查更新',
          type: 'checkbox',
          checked: autoUpdateEnabled,
          click: (item) => toggleAutoUpdate(item.checked),
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

function rebuildMenu() {
  Menu.setApplicationMenu(buildMenu());
}

// 更新偏好开关（帮助菜单 checkbox）：持久化 + 立即作用于更新服务 + 重建菜单
async function toggleAutoUpdate(enabled) {
  autoUpdateEnabled = !!enabled;
  try {
    await store.updateSettings({ autoUpdateEnabled });
    await updater?.setAutoUpdateEnabled(autoUpdateEnabled);
  } catch { /* 持久化失败不阻塞 UI */ }
  rebuildMenu();
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
      if (activeId === id) closeFindBar(view); // 删除激活应用：关闭查找栏并清除高亮
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
    // 无本地启动配置（纯远程应用）：无事可做，返回 ok 不 spawn（防御，UI 已禁用入口）
    if (app.launch?.mode === 'none') return { ok: true, skipped: true };
    // 健康检查已通过 → 服务已在运行（可能外部已手动启动），不再拉起实例
    if (await monitor.isHealthy(app)) {
      setStatus(id, 'running', '健康检查通过，服务已在运行');
      return { ok: true, skipped: true };
    }
    startAppProcess(app);
    return { ok: true };
  });
  ipcMain.handle('app:stop', async (_e, id) => {
    const app = apps.get(id);
    if (!app) return { ok: false, error: '不存在' };
    await stopAppProcess(app);
    return { ok: true };
  });
  ipcMain.handle('app:logs', (_e, id) => {
    const info = procs.info(id);
    if (!info) return { lines: [], exit: null };
    return {
      lines: info.logLines,
      exit: (info.exitCode !== null || info.signal !== null)
        ? { code: info.exitCode, signal: info.signal, uptimeMs: info.exitUptimeMs ?? 0 }
        : null,
    };
  });
  ipcMain.handle('app:openExternal', (_e, url) => {
    if (/^https?:/i.test(String(url ?? ''))) shell.openExternal(url);
    return { ok: true };
  });
  ipcMain.handle('ui:modal', (_e, open) => {
    modalOpen = !!open;
    const v = views.get(activeId);
    if (v) v.setVisible(!modalOpen);
    layoutExpandView(); // 弹窗期间隐藏浮动展开按钮，避免盖在模态框上
    updateFindViewVisibility(); // 弹窗期间隐藏查找栏（会话保留），关闭后恢复
    return { ok: true };
  });
  // 页内查找（findInPage）：show 由菜单 ⌘F 直接调用，query/next/prev/close 来自查找栏覆盖视图
  ipcMain.handle('find:show', () => { openFindBar(); return { ok: true }; });
  ipcMain.handle('find:query', (_e, text) => {
    const v = views.get(activeId);
    if (!v || !findSession.isOpen()) return { ok: false };
    const r = findSession.updateQuery(text);
    if (r.action === 'clear') {
      // 空输入：清除高亮与计数，不发起 findInPage（空串会报错）
      v.webContents.stopFindInPage('clearSelection');
      if (findView && !findView.webContents.isDestroyed()) {
        findView.webContents.send('find:result', { matches: 0, activeMatchOrdinal: 0 });
      }
    } else {
      v.webContents.findInPage(String(text ?? ''), r.options);
    }
    return { ok: true };
  });
  ipcMain.handle('find:next', () => findStep(true));
  ipcMain.handle('find:prev', () => findStep(false));
  ipcMain.handle('find:close', () => { closeFindBar(views.get(activeId)); return { ok: true }; });
  ipcMain.handle('settings:get', async () => (await store.load()).settings);
  ipcMain.handle('settings:setTheme', async (_e, theme) => {
    if (theme !== 'light' && theme !== 'dark') return { ok: false, error: `无效主题: ${theme}` };
    await store.updateSettings({ theme });
    reloadExpandView(theme); // 浮动展开按钮跟随壳主题
    reloadFindView(theme);   // 页内查找栏跟随壳主题（重载后同步会话状态）
    return { ok: true, theme };
  });
  ipcMain.handle('settings:setSidebarCollapsed', async (_e, collapsed) => {
    if (typeof collapsed !== 'boolean') return { ok: false, error: `无效状态: ${collapsed}` };
    sidebarCollapsed = collapsed;
    await store.updateSettings({ sidebarCollapsed });
    win.webContents.send('ui:sidebar-collapsed', collapsed);
    layoutActiveView(); // 应用视图铺满/让位
    layoutExpandView(); // 浮动按钮显隐（无激活应用时 layoutActiveView 提前返回，需单独调用）
    if (!collapsed) {
      // 展开后交还焦点（点击浮动按钮会聚焦到覆盖视图）
      const v = views.get(activeId);
      if (v) v.webContents.focus();
      else win?.webContents.focus();
    }
    return { ok: true, sidebarCollapsed };
  });
}

// ---------------------------------------------------------------- 冒烟测试（全链路 E2E）

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 冒烟模式开关：支持跨平台 argv 参数（npm run smoke → electron . --smoke），
// 保留 WEBDECK_SMOKE / WEBDECK_SMOKE_DSH 环境变量写法（旧命令兼容）。
const SMOKE = Boolean(process.env.WEBDECK_SMOKE) || process.argv.includes('--smoke');
const SMOKE_DSH = Boolean(process.env.WEBDECK_SMOKE_DSH) || process.argv.includes('--smoke-dsh');

async function runSmokeTest() {
  // WEBDECK_SMOKE_DSH=1 / --smoke-dsh 时改为直接验证真实 DSH Web UI（本机 127.0.0.1:3080）
  if (SMOKE_DSH) {
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
    //    ELECTRON_RUN_AS_NODE=1：子进程以纯 Node 跑 demo-server，避免受限环境下再拉起整个 Chromium
    const cfg = {
      name: 'Smoke Demo',
      url: `http://127.0.0.1:${demoPort}`,
      launch: { mode: 'shell', commandLine: `${process.execPath} ${demoServer} ${demoPort}`, timeoutMs: 15000, env: { ELECTRON_RUN_AS_NODE: '1' } },
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

    // 3.5 侧边栏应用项已渲染独立的手动控制按钮（shell 应用 → 启用态）
    const ctlOk = await win.webContents.executeJavaScript(
      `document.querySelector('#ctl-${appId}')?.disabled === false`, true);
    console.log(`SMOKE_CTL rendered=${ctlOk}`);

    // 4. 停止服务 → stopped
    await win.webContents.executeJavaScript(`webdeck.stopApp('${appId}')`, true);
    await sleep(2500);
    const data2 = await win.webContents.executeJavaScript('webdeck.listApps()', true);
    const stoppedStatus = data2.apps.find((a) => a.id === appId)?.status?.status ?? null;
    console.log(`SMOKE_STOP status=${stoppedStatus}`);

    // 5. 移除应用
    await win.webContents.executeJavaScript(`webdeck.removeApp('${appId}')`, true);

    // 6. 手动启动/停止「未激活」的应用（不调用 activateApp，验证不切换标签）
    const manualPort = 32189;
    const manualCfg = {
      name: 'Smoke Manual',
      url: `http://127.0.0.1:${manualPort}`,
      launch: { mode: 'shell', commandLine: `${process.execPath} ${demoServer} ${manualPort}`, timeoutMs: 15000, env: { ELECTRON_RUN_AS_NODE: '1' } },
      monitor: { enabled: true, url: `http://127.0.0.1:${manualPort}/health`, intervalSec: 2, expectedStatus: 200 },
    };
    const manualApp = await win.webContents.executeJavaScript(`webdeck.addApp(${JSON.stringify(manualCfg)})`, true);
    await win.webContents.executeJavaScript(`webdeck.startApp('${manualApp.id}')`, true);
    let manualRunning = null;
    for (let i = 0; i < 20 && manualRunning !== 'running'; i++) {
      await sleep(1000);
      const data = await win.webContents.executeJavaScript('webdeck.listApps()', true);
      manualRunning = data.apps.find((a) => a.id === manualApp.id)?.status?.status ?? null;
    }
    console.log(`SMOKE_MANUAL_START status=${manualRunning}`);
    const activeAfterStart = activeId; // 未激活的应用被手动启动，不应切换标签
    await win.webContents.executeJavaScript(`webdeck.stopApp('${manualApp.id}')`, true);
    await sleep(2500);
    const data3 = await win.webContents.executeJavaScript('webdeck.listApps()', true);
    const manualStopped = data3.apps.find((a) => a.id === manualApp.id)?.status?.status ?? null;
    console.log(`SMOKE_MANUAL_STOP status=${manualStopped}`);
    await win.webContents.executeJavaScript(`webdeck.removeApp('${manualApp.id}')`, true);

    // 7. 无本地启动配置（mode: none）应用的按钮应为禁用态（渲染层 DOM 检查）
    const remoteCfg = { name: 'Smoke Remote', url: 'http://127.0.0.1:9/', launch: { mode: 'none' }, monitor: { enabled: false } };
    const remoteApp = await win.webContents.executeJavaScript(`webdeck.addApp(${JSON.stringify(remoteCfg)})`, true);
    await sleep(800); // 等渲染层处理 apps:changed 并重绘列表
    const ctlNoneDisabled = await win.webContents.executeJavaScript(
      `document.querySelector('#ctl-${remoteApp.id}')?.disabled === true`, true);
    console.log(`SMOKE_CTL_NONE disabled=${ctlNoneDisabled}`);
    await win.webContents.executeJavaScript(`webdeck.removeApp('${remoteApp.id}')`, true);

    // 8. 外部已手动启动的服务（模拟用户在终端里先起好）：健康通过 → WebDeck 不应再拉起实例
    const extPort = 32191;
    const extProc = spawn(process.execPath, [demoServer, String(extPort)], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, // 纯 Node 跑外部服务
      stdio: 'ignore',
    });
    await sleep(1500); // 等外部服务就绪
    const extCfg = {
      name: 'Smoke External',
      url: `http://127.0.0.1:${extPort}`,
      launch: { mode: 'shell', commandLine: `${process.execPath} ${demoServer} ${extPort}`, timeoutMs: 15000 },
      monitor: { enabled: true, url: `http://127.0.0.1:${extPort}/health`, intervalSec: 2, expectedStatus: 200 },
    };
    const extApp = await win.webContents.executeJavaScript(`webdeck.addApp(${JSON.stringify(extCfg)})`, true);
    const extStart = await win.webContents.executeJavaScript(`webdeck.startApp('${extApp.id}')`, true);
    await sleep(800);
    const extSpawned = procs.info(extApp.id) !== null; // 守卫生效 → WebDeck 不应有自己拉起的进程
    const data4 = await win.webContents.executeJavaScript('webdeck.listApps()', true);
    const extStatus = data4.apps.find((a) => a.id === extApp.id)?.status?.status ?? null;
    console.log(`SMOKE_EXT_START skipped=${extStart?.skipped} spawned=${extSpawned} status=${extStatus}`);
    await win.webContents.executeJavaScript(`webdeck.removeApp('${extApp.id}')`, true);
    extProc.kill('SIGTERM');

    const ok = finalStatus === 'running' && stoppedStatus === 'stopped'
      && manualRunning === 'running' && manualStopped === 'stopped'
      && activeAfterStart !== manualApp.id && ctlOk && ctlNoneDisabled
      && extStart?.skipped === true && extSpawned === false && extStatus === 'running';
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
    icon: APP_ICON,
    backgroundColor: '#14161c',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.on('resize', layoutActiveView);
  win.on('closed', () => {
    // 释放覆盖视图（浮动展开按钮 + 页内查找栏），避免窗口重建时泄漏
    for (const ov of [expandView, findView]) {
      if (ov) {
        try {
          win?.contentView.removeChildView(ov);
          if (!ov.webContents.isDestroyed()) ov.webContents.close();
        } catch { /* ignore */ }
      }
    }
    expandView = null;
    findView = null;
    findViewVisible = false;
    win = null;
  });
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[webdeck] UI renderer crashed:', details.reason);
  });
  // 调试：把壳 UI 渲染层的 console 输出转发到终端（含 JS 报错）
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.error(`[ui:${level === 3 ? 'error' : 'log'}] ${message} (${sourceId}:${line})`);
  });

  // 浮动展开按钮覆盖视图：原生视图才能盖在应用 WebContentsView 之上
  expandView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/expand-preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  expandView.setBackgroundColor('#00000000');
  expandView.setVisible(false); // 默认展开态隐藏，由 layoutExpandView 按状态显隐
  win.contentView.addChildView(expandView);
  const theme = (await store.load()).settings.theme === 'light' ? 'light' : 'dark';
  reloadExpandView(theme);

  // 页内查找栏覆盖视图：原生视图才能盖在应用 WebContentsView 之上（壳 UI 只在侧边栏可见）
  findView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/find-preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  findView.setBackgroundColor('#00000000');
  findView.setVisible(false); // 默认隐藏，由 updateFindViewVisibility 按会话状态显隐
  win.contentView.addChildView(findView);
  reloadFindView(theme); // 首次加载查找栏页面（含主题注入）
}

app.whenReady().then(async () => {
  const dbg = (m) => console.error(`[boot] ${m}`);
  // BrowserWindow.icon covers Windows/Linux; macOS uses the Dock API in development.
  app.dock?.setIcon(APP_ICON);
  dbg('ready: create store');
  fileLog = createFileLogger(path.join(app.getPath('userData'), 'logs'));
  fileLog.log('[boot] WebDeck started');
  store = createStore(app.getPath('userData'));
  apps = createApps(store);
  await apps.load();
  dbg(`ready: apps loaded (${apps.list().length})`);
  procs = createProcessManager({ logSink: (line) => fileLog.log(line) });
  monitor = createMonitor({
    getApp: (id) => apps.get(id),
    getProc: (id) => procs.info(id),
    setStatus,
  });

  for (const appCfg of apps.list()) monitor.start(appCfg);

  updater = createUpdater({
    getWindow: () => win,
    logSink: (line) => fileLog.log(line), // 更新事件（检查/下载/安装/错误）落盘 webdeck.log
  });
  updater.registerIpc();
  updater.start(); // 打包版（非 portable）启动自动更新检查调度

  registerIpc(); // 先注册 IPC，渲染进程加载后会立即调用
  dbg('ready: ipc registered');
  sidebarCollapsed = (await store.load()).settings.sidebarCollapsed === true; // 缺失默认展开
  autoUpdateEnabled = (await store.load()).settings.autoUpdateEnabled !== false; // 缺失默认开启
  await createWindow();
  layoutExpandView(); // 若上次为收起态，启动即显示浮动展开按钮
  dbg('ready: window created');
  rebuildMenu();

  const lastId = (await store.load()).settings.lastActiveAppId;
  const first = apps.list()[0];
  if (lastId && apps.get(lastId)) await activateApp(lastId);
  else if (first) await activateApp(first.id);

  if (SMOKE || SMOKE_DSH) {
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

app.on('will-quit', () => {
  // 更新服务退出清理：清除调度定时器、摘除 autoUpdater 监听器
  try {
    updater?.dispose();
  } catch { /* ignore */ }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
