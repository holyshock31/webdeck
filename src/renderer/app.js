// app.js — WebDeck 渲染层：侧边栏标签页、添加/编辑弹窗、日志查看
/* global webdeck */

const AVATAR_COLORS = ['#4f8cff', '#7f5af0', '#3ecf8e', '#f5b84c', '#f0656e', '#2ec4b6', '#e07be0', '#ff9f43'];

let apps = [];
let statuses = new Map(); // id -> { status, detail }
let activeId = null;
let theme = 'dark';       // 'dark' | 'light'（持久化于 settings.theme）
let logTimer = null;
let sidebarCollapsed = false; // 侧边栏收起态（持久化于 settings.sidebarCollapsed，缺失默认展开）
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
  theme = t === 'light' ? 'light' : 'dark'; // 非法/缺失一律回退 dark
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

// ---------------------------------------------------------------- 事件绑定

function bind() {
  $('#btn-add').addEventListener('click', openAddModal);
  $('#btn-collapse').addEventListener('click', toggleSidebar);
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
  await refreshApps();
  const settings = await webdeck.getSettings().catch(() => ({}));
  applyTheme(settings?.theme);
  applySidebarCollapsed(settings?.sidebarCollapsed === true);
})();
