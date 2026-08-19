// preload.cjs — 本地 UI 的安全桥（contextIsolation + sandbox 下仅暴露白名单 API）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('webdeck', {
  // 运行平台（process.platform 值：darwin / win32 / linux），供渲染层做平台相关默认值
  platform: process.platform,

  // 应用注册表
  listApps: () => ipcRenderer.invoke('apps:list'),
  addApp: (cfg) => ipcRenderer.invoke('apps:add', cfg),
  updateApp: (id, cfg) => ipcRenderer.invoke('apps:update', id, cfg),
  removeApp: (id) => ipcRenderer.invoke('apps:remove', id),
  activateApp: (id) => ipcRenderer.invoke('apps:activate', id),

  // 应用控制
  reloadApp: (id) => ipcRenderer.invoke('app:reload', id),
  startApp: (id) => ipcRenderer.invoke('app:start', id),
  stopApp: (id) => ipcRenderer.invoke('app:stop', id),
  getLogs: (id) => ipcRenderer.invoke('app:logs', id),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  // 全局设置（主题、侧边栏收起/宽度等）
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setTheme: (theme) => ipcRenderer.invoke('settings:setTheme', theme),
  setSidebarCollapsed: (collapsed) => ipcRenderer.invoke('settings:setSidebarCollapsed', collapsed),
  // 侧边栏宽度：拖动结束落盘（settings:setSidebarWidth）；拖动中实时预览（ui:sidebar-width-preview，不落盘）
  setSidebarWidth: (width) => ipcRenderer.invoke('settings:setSidebarWidth', width),
  setSidebarWidthPreview: (width) => ipcRenderer.invoke('ui:sidebar-width-preview', width),
  // 分隔条拖动期间让应用视图忽略鼠标事件（ui:sidebar-resizing），避免拖动被原生视图截断
  setSidebarResizing: (active) => ipcRenderer.invoke('ui:sidebar-resizing', active),

  // 弹窗状态（打开时隐藏 WebContentsView，避免遮挡模态框）
  setModalOpen: (open) => ipcRenderer.invoke('ui:modal', open),

  // 更新（electron-updater）
  checkUpdate: () => ipcRenderer.invoke('updater:check'),
  quitAndInstall: () => ipcRenderer.invoke('updater:quit-install'),
  cancelDownload: () => ipcRenderer.invoke('updater:cancel'),
  openDownloadPage: () => ipcRenderer.invoke('updater:open-download'),

  // 事件订阅（返回取消函数）
  onStatus: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('apps:status', handler);
    return () => ipcRenderer.removeListener('apps:status', handler);
  },
  onAppsChanged: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('apps:changed', handler);
    return () => ipcRenderer.removeListener('apps:changed', handler);
  },
  onAddAppRequest: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('ui:add-app', handler);
    return () => ipcRenderer.removeListener('ui:add-app', handler);
  },
  onActivated: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('apps:activated', handler);
    return () => ipcRenderer.removeListener('apps:activated', handler);
  },
  onSidebarCollapsed: (cb) => {
    const handler = (_e, collapsed) => cb(collapsed);
    ipcRenderer.on('ui:sidebar-collapsed', handler);
    return () => ipcRenderer.removeListener('ui:sidebar-collapsed', handler);
  },
  onSidebarWidth: (cb) => {
    const handler = (_e, width) => cb(width);
    ipcRenderer.on('ui:sidebar-width', handler);
    return () => ipcRenderer.removeListener('ui:sidebar-width', handler);
  },
  onToggleSidebarRequest: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('ui:toggle-sidebar', handler);
    return () => ipcRenderer.removeListener('ui:toggle-sidebar', handler);
  },
  onCheckUpdateRequest: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('ui:check-update', handler);
    return () => ipcRenderer.removeListener('ui:check-update', handler);
  },
  onUpdaterEvent: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('updater:event', handler);
    return () => ipcRenderer.removeListener('updater:event', handler);
  },
});
