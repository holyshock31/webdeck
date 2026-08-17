# Tasks — add-find-in-page

- [x] src/main/find.js：新增 `createFindSession()` 纯函数状态机（open/query/next/prev/close，维护 query、matches、activeMatchOrdinal；空 query 与 close 的清除语义），不依赖 Electron
- [x] src/main/index.js：新增 findView 覆盖 WebContentsView（preload 指向 find-preload.cjs，背景透明，默认隐藏），布局锚定内容区顶部（侧边栏右侧区域），随 modalOpen 隐藏（与 expandView 同规则）
- [x] src/main/index.js：菜单编辑菜单增加「在页面中查找…」CmdOrCtrl+F / 「查找下一处」CmdOrCtrl+G / 「查找上一处」CmdOrCtrl+Shift+G，点击分别触发 find:show / find:next / find:prev（关闭态为无害 no-op）
- [x] src/main/index.js：注册 find:show / find:query / find:next / find:prev / find:close IPC——query 用 `findInPage(text, { forward: true, findNext: true })`（实测校准：Electron 37 语义 findNext:true=开启新查找会话、必发 found-in-page 事件），next/prev 用 `findNext: false` + forward 方向续找，close 用 `stopFindInPage('clearSelection')` 并隐藏 findView
- [x] src/main/index.js：每个应用视图 webContents 挂 `found-in-page` 监听，激活视图的计数（activeMatchOrdinal/matches）转发给 findView；切换应用 / 删除应用 / did-navigate 时关闭查找栏并清除旧视图高亮
- [x] src/renderer/find-bar.html：查找栏 UI——输入框（输入即搜）、n/m 计数显示、上一处/下一处/关闭按钮、Enter/Shift+Enter/Esc 键盘处理、theme query 注入跟随壳主题（dark/light），样式沿用 styles.css 主题变量
- [x] src/preload/find-preload.cjs：查找栏安全桥（show/query/next/prev/close 调用 + 计数更新订阅，contextIsolation + sandbox）
- [x] scripts/test-core.js：查找会话状态机单测（打开/查询/翻找/空 query 清除/关闭清除语义）——新增测试组
- [x] README.md 与 docs：快捷键表补充 ⌘F / ⌘G / ⇧⌘G 与「查找仅作用于当前应用页面」说明；真机验证清单（macOS 手测 ⌘F 输入即时高亮、⌘G/⇧⌘G 翻找、Esc 清除、切换应用关闭）
