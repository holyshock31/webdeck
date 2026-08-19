# Tasks — fix-activate-no-reload

## 1. 主进程：视图加载状态维护

- [x] 1.1 `createView()`（src/main/index.js L98）：视图创建时初始化加载状态字段 `__loadedUrl = null`、`__loadFailed = false`
- [x] 1.2 事件处理器维护 `__loadFailed`：`did-fail-load`（非 ABORTED，L125）与 `render-process-gone`（L129）置 true；新增 `did-finish-load` 处理器清除
- [x] 1.3 `activateApp()`（src/main/index.js L316）：计算 `needLoad = 视图新建 || view.__loadedUrl !== appCfg.url || view.__loadFailed`——仅 needLoad 时执行 `loadURL(appCfg.url)` 并写 `view.__loadedUrl = appCfg.url`；其余激活只做视图切换/可见性/聚焦，不调用 loadURL

## 2. 验证

- [x] 2.1 `npm run smoke` 通过（首次激活加载链路不受影响）
- [x] 2.2 `npm test` 通过（既有单测无破坏）
- [x] 2.3 手动真机验证：a) 切换应用不刷新且页面状态保留（表单输入/滚动位置）；b) 重复点击当前应用不刷新；c) 编辑应用 URL 保存后激活加载新 URL；d) 服务未启动→页面加载失败→启动服务→再次激活该应用自动重试成功
- [x] 2.4 `openspec validate --change fix-activate-no-reload` 通过（MODIFIED 要求块与主 spec 逐字一致）
