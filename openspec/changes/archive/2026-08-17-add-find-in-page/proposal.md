# Proposal — add-find-in-page

## Why

包装器场景下用户最常问「为什么没有查找」：内嵌网页没有浏览器外壳，⌘F 按下后没有任何反应。Electron 对 `webContents.findInPage()` 原生支持（高亮匹配 + `found-in-page` 事件回报命中数/当前序号），无需引入任何依赖即可补齐，成本极低。目标：⌘F 打开页内查找栏，在当前应用页面内实时搜索、高亮、上下翻找，Esc 关闭并清除高亮。

关键架构约束（决定实现形态）：

- **应用内容区是 WebContentsView 覆盖层**（`src/main/index.js` 的 `views` Map），壳 UI（BrowserWindow 渲染层）只在侧边栏区域可见——查找栏**不能**放进壳 UI 的 DOM，必须像浮动展开按钮（`expandView` + `src/renderer/expand-button.html` + `src/preload/expand-preload.cjs`）一样做成**独立的顶部覆盖 WebContentsView**（`findView`），盖在应用视图之上
- 查找 API 全部在主进程调用：`view.webContents.findInPage(text, { forward, findNext })`、`stopFindInPage('clearSelection')` 清除高亮、`found-in-page` 事件（`result.matches` / `result.activeMatchOrdinal`）回报计数
- 快捷键走菜单加速键主通道（与现有 ⌘R / ⌘\ 同模式）：`CmdOrCtrl+F` 打开查找栏，`CmdOrCtrl+G` / `CmdOrCtrl+Shift+G` 下一条/上一条；菜单加速键优先于内嵌页面自身的 keydown，保证远程页面抢不到 ⌘F

## What Changes

- 新增 `src/main/find.js`：纯 Node 可单测的查找会话状态机（`createFindSession()`）——open / query / next / prev / close 五态语义，维护当前 query、命中总数、当前序号，空 query 与 close 的清除语义（供 scripts/test-core.js 单测，不依赖 Electron）
- `src/main/index.js`：
  - 新增 `findView` 覆盖视图（WebContentsView，preload 走 `src/preload/find-preload.cjs`，背景透明，仅查找栏区域不透明），默认隐藏；布局锚定在内容区顶部（侧边栏之外），弹窗打开时随 `modalOpen` 隐藏（与 `expandView` 同规则）
  - 菜单：编辑菜单增加「在页面中查找…」⌘F / 「查找下一处」⌘G / 「查找上一处」⇧⌘G（关闭态点击为无害 no-op，打开时聚焦/翻找）
  - IPC：`find:show`（显示并聚焦）、`find:query`（实时搜索，`findNext:false` 从头匹配）、`find:next` / `find:prev`（`findNext:true` 续找）、`find:close`（`stopFindInPage('clearSelection')` + 隐藏）
  - 每个应用视图的 `webContents.on('found-in-page')`：当前激活视图的计数转发给 `findView`（`n/m` 显示）
  - 生命周期联动：切换应用 / 删除应用 / 页面重新加载时关闭查找栏并清除旧视图高亮；查找只作用于**当前激活的应用视图**，不作用于壳 UI 与侧边栏
- 新增 `src/renderer/find-bar.html`：查找栏 UI（输入框 + `n/m` 计数 + 上一处/下一处/关闭按钮；输入即搜、Enter 下一处、Shift+Enter 上一处、Esc 关闭；跟随壳主题 dark/light，theme query 注入，与 expand-button 同模式）
- 新增 `src/preload/find-preload.cjs`：查找栏安全桥（仅暴露 show/query/next/prev/close 与计数更新订阅）
- `scripts/test-core.js`：新增查找会话状态机单测（打开/查询/翻找/空 query 清除/关闭清除语义）
- README 与 docs：快捷键表补充 ⌘F / ⌘G / ⇧⌘G，说明查找仅作用于当前应用页面

## Impact

- **运行时行为**：新增页内查找能力（菜单 + 快捷键 + 顶部查找栏），不影响启动/进程/监测逻辑；查找栏是独立覆盖视图，不侵入内嵌页面 DOM（页面无感知，不触发 CSP/权限问题）
- **依赖**：零新增（Electron 原生 `findInPage`）
- **兼容性**：跨平台一致（CmdOrCtrl 统一）；开发态与打包态行为一致；无持久化 schema 变更
- **风险与已知限制**：页面若自己实现了查找框（如某些富文本编辑器），菜单 ⌘F 仍优先打开 WebDeck 查找栏（菜单加速键语义，与 Chrome 外壳行为一致）；「查找下一处」菜单项在查找栏关闭时点击无效果（不做菜单重建）
- **范围边界**：不做大小写/全字匹配选项、不做整词高亮动画、不做跨应用记忆查找状态（切换应用即关闭）、不把查找 UI 放进侧边栏；验收方式为 `npm test` + `npm run smoke` + 真机清单（macOS 手测 ⌘F 全链路）

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
