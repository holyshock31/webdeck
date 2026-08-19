// app.js — WebDeck 渲染层：侧边栏标签页、添加/编辑弹窗、日志查看
/* global webdeck */

const AVATAR_COLORS = ['#4f8cff', '#7f5af0', '#3ecf8e', '#f5b84c', '#f0656e', '#2ec4b6', '#e07be0', '#ff9f43'];

const SIDEBAR_MIN_WIDTH = 180;   // 侧边栏宽度下限
const SIDEBAR_DEFAULT_WIDTH = 252; // 默认宽度（settings.sidebarWidth 缺失/损坏时回退）
const COLLAPSE_DRAG_THRESHOLD = 80; // 拖拽收起阈值：释放点距窗口左缘 < 此值 → 收起（spec webdeck-core「侧边栏支持收起与展开」）

let apps = [];
let statuses = new Map(); // id -> { status, detail }
let activeId = null;
let theme = 'light';      // 'light' | 'dark'（持久化于 settings.theme，缺失默认亮色）
let logTimer = null;
let sidebarCollapsed = false; // 侧边栏收起态（持久化于 settings.sidebarCollapsed，缺失默认展开）
let sidebarWidth = SIDEBAR_DEFAULT_WIDTH; // 侧边栏当前宽度（--sidebar-width，持久化于 settings.sidebarWidth）
let lastSidebarToggle = 0;    // 防抖：菜单加速键与 keydown 双通道可能同时触发，避免重复切换

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------- 渲染

function avatarColor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function renderList() {
  const nav = $('#app-list');
  if (apps.length === 0) {
    nav.innerHTML = '<div class="empty-list">还没有应用<br/>点击左上角 ＋ 添加<br/>（URL + 启动方式 + 监测）</div>';
    return;
  }
  nav.innerHTML = '';
  for (const app of apps) {
    const item = document.createElement('div');
    item.className = 'app-item' + (app.id === activeId ? ' active' : '');
    item.dataset.id = app.id;
    item.title = `${app.name}\n${app.url}\n状态: ${statusDetail(app.id)}`;

    const avatar = document.createElement('span');
    avatar.className = 'app-avatar';
    if (app.icon) {
      // 有图标：渲染图片，加载失败回退首字母色块
      avatar.style.background = 'transparent';
      const img = document.createElement('img');
      img.className = 'app-avatar-img';
      img.src = app.icon;
      img.alt = '';
      img.onerror = () => {
        avatar.replaceChildren();
        avatar.style.background = avatarColor(app.name);
        avatar.textContent = app.name.slice(0, 1).toUpperCase();
      };
      avatar.appendChild(img);
    } else {
      avatar.style.background = avatarColor(app.name);
      avatar.textContent = app.name.slice(0, 1).toUpperCase();
    }

    const info = document.createElement('div');
    info.className = 'app-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'app-name';
    nameEl.textContent = app.name;
    const urlEl = document.createElement('div');
    urlEl.className = 'app-url';
    urlEl.textContent = app.url;
    info.append(nameEl, urlEl);

    const dot = document.createElement('span');
    dot.className = `app-dot ${statusOf(app.id)}`;
    dot.id = `dot-${app.id}`;

    // 每个应用独立的手动启动/停止按钮（▶/⏹）：作用于该应用，不切换当前标签
    const ctl = document.createElement('button');
    ctl.className = 'app-ctl';
    ctl.id = `ctl-${app.id}`;
    ctl.addEventListener('click', (e) => {
      e.stopPropagation(); // 不触发 .app-item 的标签切换
      toggleAppProc(app.id);
    });

    item.append(avatar, info, dot, ctl);
    item.addEventListener('click', () => activate(app.id));
    nav.appendChild(item);
  }
  for (const app of apps) updateAppCtl(app.id);
  updateToolbar();
  updateFooter();
}

function statusOf(id) {
  return statuses.get(id)?.status ?? 'unknown';
}

function statusDetail(id) {
  const s = statuses.get(id);
  return s ? `${s.status}${s.detail ? ' — ' + s.detail : ''}` : 'unknown';
}

function setActive(id) {
  activeId = id;
  document.querySelectorAll('.app-item').forEach((el) => el.classList.toggle('active', el.dataset.id === id));
  $('#empty-hint').style.display = id ? 'none' : 'flex';
  updateToolbar();
  updateFooter();
}

function updateToolbar() {
  const has = Boolean(activeId);
  const app = apps.find((a) => a.id === activeId);
  const hasLaunch = Boolean(app && app.launch?.mode !== 'none');
  const status = statusOf(activeId);
  const running = status === 'running' || status === 'starting';
  const toggle = $('#tb-toggle');
  toggle.disabled = !has || !hasLaunch;
  if (!hasLaunch) {
    toggle.textContent = '▶';
    toggle.title = '该应用未配置本地启动';
  } else {
    toggle.textContent = running ? '⏹' : '▶';
    toggle.title = running ? '停止本地服务' : '启动本地服务';
  }
  for (const id of ['tb-reload', 'tb-external', 'tb-logs', 'tb-edit']) $(`#${id}`).disabled = !has;
}

/** 单个应用项的手动控制按钮：随状态显示 ▶/⏹；无本地启动配置时禁用并提示。 */
function updateAppCtl(id) {
  const ctl = document.getElementById(`ctl-${id}`);
  const app = apps.find((a) => a.id === id);
  if (!ctl || !app) return;
  const hasLaunch = app.launch?.mode !== 'none';
  if (!hasLaunch) {
    ctl.disabled = true;
    ctl.textContent = '▶';
    ctl.title = '该应用未配置本地启动';
    return;
  }
  const running = statusOf(id) === 'running' || statusOf(id) === 'starting';
  ctl.disabled = false;
  ctl.textContent = running ? '⏹' : '▶';
  ctl.title = running ? '停止本地服务' : '启动本地服务';
}

/** 手动启动/停止某个应用（含未激活的）。失败给出可见反馈，状态由 apps:status 推送同步。 */
async function toggleAppProc(id) {
  const running = statusOf(id) === 'running' || statusOf(id) === 'starting';
  try {
    const res = running ? await webdeck.stopApp(id) : await webdeck.startApp(id);
    if (res && res.ok === false) alert(`操作失败: ${res.error ?? '未知错误'}`);
  } catch (err) {
    alert(`操作失败: ${err.message ?? err}`);
  }
}

function updateFooter() {
  if (!activeId) {
    $('#status-line').textContent = '尚未选择应用';
    $('#status-detail').textContent = '';
    return;
  }
  const app = apps.find((a) => a.id === activeId);
  $('#status-line').textContent = app ? app.name : '';
  $('#status-detail').textContent = statusDetail(activeId);
}

function updateDot(id) {
  const dot = document.getElementById(`dot-${id}`);
  if (dot) {
    dot.className = `app-dot ${statusOf(id)}`;
    const app = apps.find((a) => a.id === id);
    if (app) dot.closest('.app-item').title = `${app.name}\n${app.url}\n状态: ${statusDetail(id)}`;
  }
  updateAppCtl(id); // 状态推送时同步该应用的 ▶/⏹ 按钮
  if (id === activeId) {
    updateToolbar();
    updateFooter();
  }
}

// ---------------------------------------------------------------- 交互

async function activate(id) {
  const res = await webdeck.activateApp(id);
  if (res?.ok) {
    setActive(id);
    const s = res.status;
    if (s) {
      statuses.set(id, s);
      updateDot(id);
    }
  }
}

async function refreshApps() {
  const data = await webdeck.listApps();
  apps = data.apps ?? [];
  statuses.clear();
  for (const a of apps) if (a.status) statuses.set(a.id, a.status);
  if (activeId && !apps.some((a) => a.id === activeId)) activeId = null;
  renderList();
}

// ---------------------------------------------------------------- 添加 / 编辑

// 平台差异：Windows 无 python3 命令，静态服务预设用 python（macOS/Linux 维持 python3）。
// 平台经 preload 桥（webdeck.platform）暴露，不依赖 navigator 推断。
const STATIC_SERVER_CMD = webdeck.platform === 'win32'
  ? 'python -m http.server 8000'
  : 'python3 -m http.server 8000';

const PRESETS = {
  dsh: {
    name: 'DeepSeek Harness',
    url: 'http://127.0.0.1:3080',
    launch: { mode: 'shell', commandLine: 'pnpm dsh', cwd: '' },
    monitor: { enabled: true, url: 'http://127.0.0.1:3080', intervalSec: 5, expectedStatus: 200 },
  },
  static: {
    name: '本地静态服务',
    url: 'http://127.0.0.1:8000',
    launch: { mode: 'shell', commandLine: STATIC_SERVER_CMD, cwd: '' },
    monitor: { enabled: true, url: 'http://127.0.0.1:8000', intervalSec: 5, expectedStatus: 200 },
  },
};

function showModal(show) {
  $('#modal-app').classList.toggle('hidden', !show);
  webdeck.setModalOpen(show).catch(() => {});
}

function openAddModal() {
  $('#modal-app-title').textContent = '添加应用';
  $('#form-app').reset();
  $('#f-name').value = '';
  $('#f-url').value = '';
  $('#f-icon-preset').value = '';
  $('#f-icon').value = '';
  $('#f-timeoutSec').value = 30;
  $('#f-intervalSec').value = 5;
  $('#f-statusCode').value = 200;
  $('#f-waitForUrl').checked = true;
  $('#f-stopOnQuit').checked = true;
  $('#f-startOnOpen').checked = true;
  $('#f-monitor').checked = true;
  document.querySelector('input[name="f-launch-mode"][value="none"]').checked = true;
  syncLaunchFields();
  window.__editId = null;
  showModal(true);
  $('#f-name').focus();
}

function openEditModal() {
  const app = apps.find((a) => a.id === activeId);
  if (!app) return;
  $('#modal-app-title').textContent = '编辑应用';
  $('#f-name').value = app.name;
  $('#f-url').value = app.url;
  $('#f-icon').value = app.icon ?? '';
  $('#f-icon-preset').value = app.icon === 'icons/dsh.png' ? 'icons/dsh.png' : '';
  document.querySelector(`input[name="f-launch-mode"][value="${app.launch.mode}"]`).checked = true;
  $('#f-command').value = app.launch.command ?? '';
  $('#f-args').value = (app.launch.args ?? []).join('\n');
  $('#f-commandLine').value = app.launch.commandLine ?? '';
  $('#f-cwd').value = app.launch.cwd ?? '';
  $('#f-env').value = Object.entries(app.launch.env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n');
  $('#f-waitForUrl').checked = app.launch.waitForUrl !== false;
  $('#f-timeoutSec').value = Math.round((app.launch.timeoutMs ?? 30000) / 1000);
  $('#f-stopOnQuit').checked = app.launch.stopOnQuit !== false;
  $('#f-startOnOpen').checked = app.startOnOpen !== false;
  $('#f-monitor').checked = app.monitor.enabled !== false;
  $('#f-healthUrl').value = app.monitor.url === app.url ? '' : (app.monitor.url ?? '');
  $('#f-intervalSec').value = app.monitor.intervalSec ?? 5;
  $('#f-statusCode').value = app.monitor.expectedStatus ?? 200;
  syncLaunchFields();
  window.__editId = app.id;
  showModal(true);
}

function syncLaunchFields() {
  const mode = document.querySelector('input[name="f-launch-mode"]:checked').value;
  for (const el of document.querySelectorAll('.launch-fields')) {
    el.hidden = el.dataset.mode !== mode;
  }
}

function collectForm() {
  const mode = document.querySelector('input[name="f-launch-mode"]:checked').value;
  const env = {};
  for (const line of $('#f-env').value.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf('=');
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return {
    name: $('#f-name').value.trim(),
    url: $('#f-url').value.trim(),
    icon: $('#f-icon').value.trim(),
    startOnOpen: $('#f-startOnOpen').checked,
    launch: {
      mode,
      command: $('#f-command').value.trim(),
      args: $('#f-args').value.split('\n').map((s) => s.trim()).filter(Boolean),
      commandLine: $('#f-commandLine').value.trim(),
      cwd: $('#f-cwd').value.trim(),
      env,
      waitForUrl: $('#f-waitForUrl').checked,
      timeoutMs: (Number($('#f-timeoutSec').value) || 30) * 1000,
      stopOnQuit: $('#f-stopOnQuit').checked,
    },
    monitor: {
      enabled: $('#f-monitor').checked,
      url: $('#f-healthUrl').value.trim(),
      intervalSec: Number($('#f-intervalSec').value) || 5,
      expectedStatus: Number($('#f-statusCode').value) || 200,
    },
  };
}

// ---------------------------------------------------------------- 主题

function applyTheme(t) {
  theme = t === 'dark' ? 'dark' : 'light'; // 非法/缺失一律回退 light
  document.documentElement.dataset.theme = theme;
  const btn = $('#tb-theme');
  if (btn) {
    btn.textContent = theme === 'dark' ? '🌙' : '☀️';
    btn.title = theme === 'dark' ? '切换到浅色主题' : '切换到暗色主题';
  }
}

async function toggleTheme() {
  const next = theme === 'dark' ? 'light' : 'dark';
  try {
    const res = await webdeck.setTheme(next);
    if (res?.ok) applyTheme(next);
    else alert(`主题切换失败: ${res.error ?? '未知错误'}`);
  } catch (err) {
    alert(`主题切换失败: ${err.message ?? err}`);
  }
}

// ---------------------------------------------------------------- 侧边栏收起/展开

function applySidebarCollapsed(collapsed) {
  sidebarCollapsed = !!collapsed;
  document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  const btn = $('#btn-collapse');
  if (btn) {
    btn.textContent = sidebarCollapsed ? '▶' : '◀';
    btn.title = sidebarCollapsed ? '展开侧边栏 (⌘\\)' : '收起侧边栏 (⌘\\)';
  }
}

async function toggleSidebar() {
  const now = Date.now();
  if (now - lastSidebarToggle < 200) return; // 菜单加速键与 keydown 双通道可能同时触发，防重复切换
  lastSidebarToggle = now;
  const next = !sidebarCollapsed;
  try {
    const res = await webdeck.setSidebarCollapsed(next);
    if (res?.ok) applySidebarCollapsed(next);
    else alert(`侧边栏切换失败: ${res.error ?? '未知错误'}`);
  } catch (err) {
    alert(`侧边栏切换失败: ${err.message ?? err}`);
  }
}

// ---------------------------------------------------------------- 侧边栏宽度调整

// 宽度钳制：[180, max(180, 窗口宽度/2)]，拖动中与落盘前都钳制，保证主内容区始终可用
// 宽度钳制：常规下限 180px、上限窗口宽度一半；allowCollapseZone 时下限放开到 0
//（拖拽进入收起阈值区临时跟随指针，松手时才判定收起/回弹；窄宽度不落盘）
function clampSidebarWidth(w, { allowCollapseZone = false } = {}) {
  const n = Math.round(Number(w));
  if (!Number.isFinite(n)) return sidebarWidth; // 非数值输入保持当前宽度
  const max = Math.max(SIDEBAR_MIN_WIDTH, Math.round(window.innerWidth / 2));
  const min = allowCollapseZone ? 0 : SIDEBAR_MIN_WIDTH;
  return Math.min(Math.max(n, min), max);
}

// 应用宽度：写入 --sidebar-width 变量（styles.css 中 #sidebar 宽度由此驱动）并记录状态
function applySidebarWidth(w, opts) {
  const clamped = clampSidebarWidth(w, opts);
  sidebarWidth = clamped;
  document.documentElement.style.setProperty('--sidebar-width', `${clamped}px`);
  return clamped;
}

// 分隔条拖动：pointerdown 捕获指针并进入 resizing 态（全局 col-resize + 禁止文本选中）；
// pointermove 实时计算宽度（钳制）写入 CSS 变量，并经预览通道同步主进程重排原生应用视图；
// pointerup 落盘（settings.sidebarWidth 原子写入），收起态下分隔条隐藏、不响应。
function initSidebarResizer() {
  const resizer = $('#sidebar-resizer');
  if (!resizer) return;
  let dragging = false;
  let moved = false; // 拖动期间是否发生过 pointermove（纯点击不触发缩放）
  let lastValidWidth = SIDEBAR_DEFAULT_WIDTH; // 拖动开始前的宽度：拖入阈值区收起时恢复（不落盘窄宽度）
  resizer.addEventListener('pointerdown', (e) => {
    if (document.body.classList.contains('sidebar-collapsed')) return;
    dragging = true;
    moved = false;
    lastValidWidth = sidebarWidth; // 拖动起点即"进入阈值区前的合法宽度"基线
    try { resizer.setPointerCapture(e.pointerId); } catch { /* 指针已失效等边缘情况：不阻断拖动 */ }
    document.body.classList.add('resizing');
    e.preventDefault();
  });
  resizer.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    moved = true;
    applySidebarWidth(e.clientX, { allowCollapseZone: true }); // 阈值区内允许低于 180 临时跟随
    webdeck.setSidebarWidthPreview(e.clientX).catch(() => {}); // 实时同步原生视图，不落盘
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
    if (resizer.hasPointerCapture(e.pointerId)) resizer.releasePointerCapture(e.pointerId);
    if (e.type === 'pointercancel') return; // 取消（指针丢失等）：保持当前宽度，不落盘
    if (!moved) return; // 纯点击（无移动）：只清除拖拽态，不改变宽度
    const raw = Number(e.clientX);
    if (Number.isFinite(raw) && raw < COLLAPSE_DRAG_THRESHOLD) {
      // 拖入收起阈值区：恢复进入阈值区前的合法宽度并持久化（窄宽度不落盘），进入收起态
      applySidebarWidth(lastValidWidth);
      webdeck.setSidebarWidth(lastValidWidth).catch(() => {}); // 与主进程宽度保持一致（展开时视图对齐）
      applySidebarCollapsed(true);
      webdeck.setSidebarCollapsed(true).catch(() => {}); // 与按钮/⌘\ 收起等效（含持久化与展开恢复）
      return;
    }
    const w = applySidebarWidth(e.clientX);
    webdeck.setSidebarWidth(w).catch(() => {}); // 拖动结束落盘，重启后保持
  };
  resizer.addEventListener('pointerup', endDrag);
  resizer.addEventListener('pointercancel', endDrag);
}

// ---------------------------------------------------------------- 日志

async function openLogs() {
  const app = apps.find((a) => a.id === activeId);
  if (!app) return;
  $('#modal-logs-title').textContent = `启动日志 — ${app.name}`;
  $('#log-content').textContent = '（无日志，进程未启动或尚无输出）';
  $('#modal-logs').classList.toggle('hidden', false);
  webdeck.setModalOpen(true).catch(() => {});
  clearInterval(logTimer);
  const refresh = async () => {
    const data = await webdeck.getLogs(app.id);
    const lines = Array.isArray(data) ? data : (data?.lines ?? []); // 兼容旧结构
    const exit = data && !Array.isArray(data) ? data.exit : null;
    const el = $('#log-content');
    if (!lines.length && !exit) {
      el.textContent = '（无日志输出）';
    } else {
      const exitLine = exit ? `进程已退出 (code=${exit.code}${exit.signal ? `, signal=${exit.signal}` : ''}, 存活 ${Math.round(exit.uptimeMs ?? 0)}ms)` : '';
      el.textContent = [exitLine, ...lines].filter(Boolean).join('\n');
    }
    el.scrollTop = el.scrollHeight;
  };
  await refresh();
  logTimer = setInterval(refresh, 2000);
}

function closeLogs() {
  clearInterval(logTimer);
  logTimer = null;
  $('#modal-logs').classList.add('hidden');
  webdeck.setModalOpen(false).catch(() => {});
}

// ---------------------------------------------------------------- 更新（electron-updater）

// 更新状态：available / downloading(progress) / downloaded / error / 空闲
// installError：下载完成后的安装阶段失败原因（macOS 签名校验失败等）——非空时
// 界面展示失败信息与「打开下载页」兜底，不再静默（fix-mac-unsigned-update）
let updState = { available: false, downloaded: false, progress: null, info: null, error: null, installError: null };
let manualCheck = false; // 手动检查标志：仅手动场景才提示"已是最新"/错误

// 更新状态持久化（localStorage）：跨重启记住「下载完成的版本」与「忽略的版本」
const UPDATE_STATE_KEY = 'webdeck.updateState';
let updPersist = { ignoredVersion: null, downloadedVersion: null };
function loadUpdateState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(UPDATE_STATE_KEY) ?? 'null');
    return {
      ignoredVersion: typeof parsed?.ignoredVersion === 'string' ? parsed.ignoredVersion : null,
      downloadedVersion: typeof parsed?.downloadedVersion === 'string' ? parsed.downloadedVersion : null,
    };
  } catch { return { ignoredVersion: null, downloadedVersion: null }; }
}
function saveUpdateState(patch) {
  updPersist = { ...updPersist, ...patch };
  try { localStorage.setItem(UPDATE_STATE_KEY, JSON.stringify(updPersist)); } catch { /* 持久化失败忽略 */ }
}

function updBanner(text, btnText, btnCb) {
  $('#update-banner-text').textContent = text;
  const btn = $('#update-banner-btn');
  btn.textContent = btnText;
  btn.onclick = btnCb;
  $('#update-banner').classList.remove('hidden');
}
function hideUpdBanner() {
  $('#update-banner').classList.add('hidden');
}
// 下载中提示条的「取消」按钮显隐（仅 download_progress 期间可见）
function setCancelBtnVisible(visible) {
  $('#update-banner-cancel').classList.toggle('hidden', !visible);
}

function openUpdateModal() {
  const actions = $('#modal-update-actions');
  actions.innerHTML = '';
  const body = $('#modal-update-body');
  const info = updState.info ?? {};
  const version = info.version ? ` v${info.version}` : '';
  if (updState.downloaded) {
    if (updState.installError) {
      // 安装阶段失败（macOS 签名校验失败等）：展示原因，可重试安装或打开下载页兜底
      $('#modal-update-title').textContent = '安装更新失败';
      body.textContent = `更新包已下载但安装失败：${updState.installError}`;
      const later = document.createElement('button');
      later.type = 'button'; later.className = 'btn'; later.textContent = '稍后';
      later.onclick = () => { updState = { ...updState, installError: null }; closeUpdateModal(); };
      const retry = document.createElement('button');
      retry.type = 'button'; retry.className = 'btn'; retry.textContent = '重试安装';
      retry.onclick = () => webdeck.quitAndInstall();
      const dl = document.createElement('button');
      dl.type = 'button'; dl.className = 'btn btn-primary'; dl.textContent = '打开下载页';
      dl.onclick = () => webdeck.openDownloadPage();
      actions.append(later, retry, dl);
    } else {
      $('#modal-update-title').textContent = `新版本${version}已就绪`;
      body.textContent = '更新包已下载完成，安装后应用将自动重启。';
      const later = document.createElement('button');
      later.type = 'button'; later.className = 'btn'; later.textContent = '稍后';
      later.onclick = () => { updState = { ...updState, downloaded: false, installError: null }; closeUpdateModal(); };
      const install = document.createElement('button');
      install.type = 'button'; install.className = 'btn btn-primary'; install.textContent = '立即安装';
      install.onclick = () => webdeck.quitAndInstall();
      actions.append(later, install);
    }
  } else {
    $('#modal-update-title').textContent = `发现新版本${version}`;
    // releaseNotes 已由主进程按应用语言本地化（localizeReleaseNotes），直接显示
    body.textContent = info.releaseNotes && info.releaseNotes !== 'null'
      ? String(info.releaseNotes)
      : `有新版本${version}可用。`;
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'btn'; close.textContent = '关闭';
    close.onclick = closeUpdateModal;
    const ignore = document.createElement('button');
    ignore.type = 'button'; ignore.className = 'btn'; ignore.textContent = '忽略此版本';
    ignore.onclick = () => {
      // 忽略后该版本不再提示（含重启后）；再次「检查更新」仍可重新下载
      if (info.version) saveUpdateState({ ignoredVersion: String(info.version) });
      hideUpdBanner();
      closeUpdateModal();
    };
    const download = document.createElement('button');
    download.type = 'button'; download.className = 'btn btn-primary';
    download.textContent = '打开下载页';
    download.onclick = () => webdeck.openDownloadPage();
    actions.append(close, ignore, download);
  }
  $('#modal-update').classList.remove('hidden');
  webdeck.setModalOpen(true).catch(() => {});
}
function closeUpdateModal() {
  $('#modal-update').classList.add('hidden');
  webdeck.setModalOpen(false).catch(() => {});
}

async function doCheckUpdate() {
  manualCheck = true;
  const res = await webdeck.checkUpdate();
  if (!res.ok) {
    alert(`检查更新失败：${res.error}`);
    manualCheck = false;
  }
}

function initUpdater() {
  updPersist = loadUpdateState();
  // 下载完成未安装（跨重启）：直接显示可安装提示条（启动检查会复用缓存并重新确认）
  if (updPersist.downloadedVersion) {
    updState = { ...updState, available: true, downloaded: true, progress: 100, info: { version: updPersist.downloadedVersion } };
    updBanner('新版本已就绪，可立即安装', '立即安装', () => webdeck.quitAndInstall());
  }
  webdeck.onCheckUpdateRequest(() => doCheckUpdate());
  webdeck.onUpdaterEvent((ev) => {
    switch (ev.type) {
      case 'available':
        updState = { ...updState, available: true, info: ev.info ?? ev, progress: null, installError: null };
        setCancelBtnVisible(false);
        // 用户已「忽略此版本」：记录状态但不打扰（再次检查更新仍可重新下载）
        if (ev.version && String(ev.version) === updPersist.ignoredVersion) break;
        updBanner(`发现新版本${ev.version ? ' v' + ev.version : ''}`, '查看', openUpdateModal);
        break;
      case 'not_available':
        if (manualCheck) { alert('已是最新版本'); manualCheck = false; }
        break;
      case 'download_progress':
        updState.progress = ev.percent ?? 0;
        if (updState.installError) updState = { ...updState, installError: null }; // 新一轮下载进行中：清除陈旧安装错误
        setCancelBtnVisible(true);
        updBanner(`正在下载更新… ${Math.round(updState.progress)}%`, '查看', openUpdateModal);
        break;
      case 'cancelled':
        // 下载被取消（用户点「取消」/关机保护）：清进度并收起提示条，更新仍可用可重查
        updState = { ...updState, progress: null, downloaded: false, installError: null };
        setCancelBtnVisible(false);
        hideUpdBanner();
        break;
      case 'downloaded':
        // 已忽略的版本下载完成：不提示（与 available 的忽略语义一致）
        if (ev.version && String(ev.version) === updPersist.ignoredVersion) break;
        if (ev.version) saveUpdateState({ downloadedVersion: String(ev.version) });
        updState = { ...updState, downloaded: true, available: true, progress: 100, installError: null };
        setCancelBtnVisible(false);
        updBanner('新版本已就绪，可立即安装', '立即安装', () => webdeck.quitAndInstall());
        if (manualCheck) openUpdateModal();
        manualCheck = false;
        break;
      case 'error': {
        setCancelBtnVisible(false);
        const msg = ev.message ?? '未知错误';
        if (manualCheck) { alert(`更新失败：${msg}`); manualCheck = false; }
        // 已下载待安装状态下的错误（macOS 安装阶段签名校验失败等）：
        // 无论自动/手动场景都必须可见——提示条展示原因，「打开下载页」兜底，
        // 弹窗内可重试安装（fix-mac-unsigned-update，此前静默无反馈）
        if (updState.downloaded) {
          updState = { ...updState, installError: msg };
          updBanner('安装更新失败，可重试或打开下载页', '打开下载页', () => webdeck.openDownloadPage());
          openUpdateModal();
        }
        break;
      }
      default: break;
    }
  });
  $('#update-banner-close').addEventListener('click', hideUpdBanner);
  // 「取消」按钮：经 IPC 中止进行中的下载（electron-updater 随后广播 cancelled 事件）
  $('#update-banner-cancel').addEventListener('click', () => {
    setCancelBtnVisible(false);
    hideUpdBanner();
    webdeck.cancelDownload().catch(() => {});
  });
  $('#modal-update').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeUpdateModal(); });
}

// ---------------------------------------------------------------- 事件绑定

function bind() {
  $('#btn-add').addEventListener('click', openAddModal);
  $('#btn-collapse').addEventListener('click', toggleSidebar);
  initSidebarResizer();
  $('#tb-toggle').addEventListener('click', () => { if (activeId) toggleAppProc(activeId); });
  $('#tb-reload').addEventListener('click', () => activeId && webdeck.reloadApp(activeId));
  $('#tb-external').addEventListener('click', () => {
    const app = apps.find((a) => a.id === activeId);
    if (app) webdeck.openExternal(app.url);
  });
  $('#tb-logs').addEventListener('click', openLogs);
  $('#tb-edit').addEventListener('click', openEditModal);
  $('#tb-theme').addEventListener('click', toggleTheme);

  $('#btn-cancel').addEventListener('click', () => showModal(false));
  $('#btn-logs-close').addEventListener('click', closeLogs);
  $('#modal-app').addEventListener('click', (e) => { if (e.target === e.currentTarget) showModal(false); });
  $('#modal-logs').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeLogs(); });

  document.querySelectorAll('input[name="f-launch-mode"]').forEach((r) => r.addEventListener('change', syncLaunchFields));

  // 内置图标快捷选择：选中即填入输入框，可再手动修改
  $('#f-icon-preset').addEventListener('change', (e) => {
    $('#f-icon').value = e.target.value || '';
  });

  $('#f-preset').addEventListener('change', (e) => {
    const preset = PRESETS[e.target.value];
    if (!preset) return;
    $('#f-name').value = preset.name;
    $('#f-url').value = preset.url;
    document.querySelector(`input[name="f-launch-mode"][value="${preset.launch.mode}"]`).checked = true;
    $('#f-commandLine').value = preset.launch.commandLine ?? '';
    $('#f-command').value = '';
    $('#f-args').value = '';
    $('#f-cwd').value = preset.launch.cwd ?? '';
    if (preset.monitor) {
      $('#f-monitor').checked = true;
      $('#f-healthUrl').value = preset.monitor.url;
      $('#f-intervalSec').value = preset.monitor.intervalSec;
      $('#f-statusCode').value = preset.monitor.expectedStatus;
    }
    syncLaunchFields();
  });

  $('#form-app').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const cfg = collectForm();
      const editId = window.__editId;
      const app = editId ? await webdeck.updateApp(editId, cfg) : await webdeck.addApp(cfg);
      showModal(false);
      await refreshApps();
      await activate(app.id);
    } catch (err) {
      alert(`保存失败: ${err.message ?? err}`);
    }
  });

  webdeck.onStatus(({ id, status, detail }) => {
    statuses.set(id, { status, detail });
    updateDot(id);
  });
  webdeck.onAppsChanged(() => refreshApps());
  webdeck.onAddAppRequest(openAddModal);
  webdeck.onSidebarCollapsed(applySidebarCollapsed);
  webdeck.onSidebarWidth((w) => applySidebarWidth(w)); // 主进程钳制/落盘后以主进程结果为准
  webdeck.onToggleSidebarRequest(() => toggleSidebar());
  webdeck.onActivated(({ id, status }) => {
    // 主进程激活（启动自动激活 / 菜单切换）后同步渲染层，避免工具栏/高亮停留在未选中态
    if (status) {
      statuses.set(id, status);
      updateDot(id);
    }
    setActive(id);
  });

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'n') { e.preventDefault(); openAddModal(); }
    if (mod && e.key === '\\') { e.preventDefault(); toggleSidebar(); } // 壳 UI 聚焦时兜底；菜单加速键为主通道
    if (mod && !e.shiftKey && e.key >= '1' && e.key <= '9') {
      const idx = Number(e.key) - 1;
      const app = apps[idx];
      if (app) { e.preventDefault(); activate(app.id); }
    }
    if (e.key === 'Escape') {
      if (!$('#modal-app').classList.contains('hidden')) showModal(false);
      else if (!$('#modal-logs').classList.contains('hidden')) closeLogs();
    }
  });
}

// ---------------------------------------------------------------- 启动

(async function init() {
  bind();
  initUpdater();
  await refreshApps();
  const settings = await webdeck.getSettings().catch(() => ({}));
  applyTheme(settings?.theme);
  applySidebarCollapsed(settings?.sidebarCollapsed === true);
  // 启动时以持久化宽度恢复（缺失/非数值回退默认 252px），并同步主进程布局
  const w = applySidebarWidth(Number(settings?.sidebarWidth) || SIDEBAR_DEFAULT_WIDTH);
  webdeck.setSidebarWidthPreview(w).catch(() => {});
})();
