// preload.cjs — 本地 UI 的安全桥（contextIsolation + sandbox 下仅暴露白名单 API）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('webdeck', {
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
});
