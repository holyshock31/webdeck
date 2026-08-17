// find-preload.cjs — 页内查找栏覆盖视图的安全桥（仅暴露查找动作与计数订阅）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('webdeckFind', {
  // 查找动作：show（重新聚焦输入框）/ query（输入即搜）/ next / prev / close
  show: () => ipcRenderer.invoke('find:show'),
  query: (text) => ipcRenderer.invoke('find:query', text),
  next: () => ipcRenderer.invoke('find:next'),
  prev: () => ipcRenderer.invoke('find:prev'),
  close: () => ipcRenderer.invoke('find:close'),

  // 计数更新订阅（返回取消函数）
  onResult: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('find:result', handler);
    return () => ipcRenderer.removeListener('find:result', handler);
  },
  // 关闭/清空时重置栏内输入与计数
  onReset: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('find:reset', handler);
    return () => ipcRenderer.removeListener('find:reset', handler);
  },
  // 主题重载后同步会话状态（不丢输入/计数）
  onSync: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('find:sync', handler);
    return () => ipcRenderer.removeListener('find:sync', handler);
  },
});
