// app.js — WebDeck 渲染层：侧边栏标签页、添加/编辑弹窗、日志查看
/* global webdeck */

const AVATAR_COLORS = ['#4f8cff', '#7f5af0', '#3ecf8e', '#f5b84c', '#f0656e', '#2ec4b6', '#e07be0', '#ff9f43'];

let apps = [];
let statuses = new Map(); // id -> { status, detail }
let activeId = null;
let logTimer = null;

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
    avatar.style.background = avatarColor(app.name);
    avatar.textContent = app.name.slice(0, 1).toUpperCase();

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

    item.append(avatar, info, dot);
    item.addEventListener('click', () => activate(app.id));
    nav.appendChild(item);
  }
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
  const status = statusOf(activeId);
  const running = status === 'running' || status === 'starting';
  const toggle = $('#tb-toggle');
  toggle.disabled = !has;
  toggle.textContent = running ? '⏹' : '▶';
  toggle.title = running ? '停止本地服务' : '启动本地服务';
  for (const id of ['tb-reload', 'tb-external', 'tb-logs', 'tb-edit']) $(`#${id}`).disabled = !has;
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
  if (id === activeId) updateFooter();
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
    launch: { mode: 'shell', commandLine: 'python3 -m http.server 8000', cwd: '' },
    monitor: { enabled: true, url: 'http://127.0.0.1:8000', intervalSec: 5, expectedStatus: 200 },
  },
};

function showModal(show) {
  $('#modal-app').classList.toggle('hidden', !show);
}

function openAddModal() {
  $('#modal-app-title').textContent = '添加应用';
  $('#form-app').reset();
  $('#f-name').value = '';
  $('#f-url').value = '';
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

// ---------------------------------------------------------------- 日志

async function openLogs() {
  const app = apps.find((a) => a.id === activeId);
  if (!app) return;
  $('#modal-logs-title').textContent = `启动日志 — ${app.name}`;
  $('#log-content').textContent = '（无日志，进程未启动或尚无输出）';
  $('#modal-logs').classList.toggle('hidden', false);
  clearInterval(logTimer);
  const refresh = async () => {
    const lines = await webdeck.getLogs(app.id);
    const el = $('#log-content');
    el.textContent = lines.length ? lines.join('\n') : '（无日志输出）';
    el.scrollTop = el.scrollHeight;
  };
  await refresh();
  logTimer = setInterval(refresh, 2000);
}

function closeLogs() {
  clearInterval(logTimer);
  logTimer = null;
  $('#modal-logs').classList.add('hidden');
}

// ---------------------------------------------------------------- 事件绑定

function bind() {
  $('#btn-add').addEventListener('click', openAddModal);
  $('#tb-toggle').addEventListener('click', async () => {
    if (!activeId) return;
    const st = statusOf(activeId);
    if (st === 'running' || st === 'starting') await webdeck.stopApp(activeId);
    else await webdeck.startApp(activeId);
  });
  $('#tb-reload').addEventListener('click', () => activeId && webdeck.reloadApp(activeId));
  $('#tb-external').addEventListener('click', () => {
    const app = apps.find((a) => a.id === activeId);
    if (app) webdeck.openExternal(app.url);
  });
  $('#tb-logs').addEventListener('click', openLogs);
  $('#tb-edit').addEventListener('click', openEditModal);

  $('#btn-cancel').addEventListener('click', () => showModal(false));
  $('#btn-logs-close').addEventListener('click', closeLogs);
  $('#modal-app').addEventListener('click', (e) => { if (e.target === e.currentTarget) showModal(false); });
  $('#modal-logs').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeLogs(); });

  document.querySelectorAll('input[name="f-launch-mode"]').forEach((r) => r.addEventListener('change', syncLaunchFields));

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

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'n') { e.preventDefault(); openAddModal(); }
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
})();
