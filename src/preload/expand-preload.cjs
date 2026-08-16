// expand-preload.cjs — 浮动展开按钮覆盖视图的安全桥（仅暴露展开动作）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('webdeckExpand', {
  // 收起态下点击窗口左缘浮动按钮 → 重新展开侧边栏
  expandSidebar: () => ipcRenderer.invoke('settings:setSidebarCollapsed', false),
});
