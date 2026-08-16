# Verification — restore-implemented-specs

Date: 2026-08-16T16:40:23.866Z
Change: openspec/changes/restore-implemented-specs
Model: deepseek-official / deepseek-v4-flash (flash)

**18/18 scenarios passed**

## Scenarios

| # | Result | Requirement | Scenario | Reason |
|---|--------|-------------|----------|--------|
| 1 | ✅ | 通过 URL 添加应用并配置启动方式 | 添加仅打开 URL 的应用 | normalizeApp 自动补全 http://，添加后侧边栏通过 apps:list 显示 |
| 2 | ✅ | 通过 URL 添加应用并配置启动方式 | 使用 Shell 命令拉起本地服务 | startOnOpen 为 true 时 activateApp 调用 startAppProcess 拉起服务，监测通过后状态变 running |
| 3 | ✅ | 通过 URL 添加应用并配置启动方式 | 配置校验失败给出错误 | normalizeApp 对 direct 空 command 和 shell 空 commandLine 分别抛错，UI 提示保存失败 |
| 4 | ✅ | 应用配置持久化 | 重启后应用仍在 | createStore 原子写入 webdeck.json，app.whenReady 调 apps.load() 恢复 |
| 5 | ✅ | 应用配置持久化 | 更新与删除均持久化 | apps.update/remove 调用 persist() 写盘，重启后 load() 恢复 |
| 6 | ✅ | 应用配置持久化 | 重启后恢复上次打开的应用 | activateApp 存 lastActiveAppId，app.whenReady 根据它恢复激活 |
| 7 | ✅ | 本地服务进程生命周期管理 | 停止命令结束整个进程组 | spawn 带 detached:true，stop 用 process.kill(-group) 信号终止进程组 |
| 8 | ✅ | 本地服务进程生命周期管理 | 查看启动日志 | logLines 环形缓冲上限 400 行，openLogs 实时轮询并自动滚动，closeLogs 清理 timer |
| 9 | ✅ | 本地服务进程生命周期管理 | 退出 WebDeck 清理进程 | before-quit 调 proc.stopMany 仅对 stopOnQuit 非 false 的应用 |
| 10 | ✅ | 健康监测状态机 | 服务就绪后状态变绿 | monitor.tick 健康检查通过时 setStatus running |
| 11 | ✅ | 健康监测状态机 | 启动超时报错 | elapsed > launchTimeout 时置 error 并显示超时原因与 URL |
| 12 | ✅ | 健康监测状态机 | 停止服务后状态变灰 | monitor 检查 procAlive 为 false 时置 stopped |
| 13 | ✅ | 多应用标签与登录态隔离 | 两个应用的登录态互不影响 | 每个应用独立 session 分区 persist:webdeck-<id>，登录态互不串扰且持久 |
| 14 | ✅ | 多应用标签与登录态隔离 | 快捷键切换标签 | keydown 处理 ⌘1-⌘9 切标签；重复点击侧边栏 activateApp 重新 loadURL 回首页 |
| 15 | ✅ | 远程内容安全隔离 | 远程页面无法访问 Node API | WebContentsView 使用 sandbox:true + contextIsolation:true，无 nodeIntegration |
| 16 | ✅ | 远程内容安全隔离 | 新窗口链接转到系统浏览器 | setWindowOpenHandler 对 http/https 调 shell.openExternal 并 deny |
| 17 | ✅ | 运行状态可视化与操作 | 状态灯随监测结果实时变化 | setStatus 通过 IPC apps:status 推送，renderer 更新状态灯 |
| 18 | ✅ | 运行状态可视化与操作 | 工具栏操作 | tb-toggle 停止/启动对应 stopApp/startApp；tb-reload 调 reloadApp |

## Raw judge output

```
OK|通过 URL 添加应用并配置启动方式: 添加仅打开 URL 的应用 — normalizeApp 自动补全 http://，添加后侧边栏通过 apps:list 显示
OK|通过 URL 添加应用并配置启动方式: 使用 Shell 命令拉起本地服务 — startOnOpen 为 true 时 activateApp 调用 startAppProcess 拉起服务，监测通过后状态变 running
OK|通过 URL 添加应用并配置启动方式: 配置校验失败给出错误 — normalizeApp 对 direct 空 command 和 shell 空 commandLine 分别抛错，UI 提示保存失败
OK|应用配置持久化: 重启后应用仍在 — createStore 原子写入 webdeck.json，app.whenReady 调 apps.load() 恢复
OK|应用配置持久化: 更新与删除均持久化 — apps.update/remove 调用 persist() 写盘，重启后 load() 恢复
OK|应用配置持久化: 重启后恢复上次打开的应用 — activateApp 存 lastActiveAppId，app.whenReady 根据它恢复激活
OK|本地服务进程生命周期管理: 停止命令结束整个进程组 — spawn 带 detached:true，stop 用 process.kill(-group) 信号终止进程组
OK|本地服务进程生命周期管理: 查看启动日志 — logLines 环形缓冲上限 400 行，openLogs 实时轮询并自动滚动，closeLogs 清理 timer
OK|本地服务进程生命周期管理: 退出 WebDeck 清理进程 — before-quit 调 proc.stopMany 仅对 stopOnQuit 非 false 的应用
OK|健康监测状态机: 服务就绪后状态变绿 — monitor.tick 健康检查通过时 setStatus running
OK|健康监测状态机: 启动超时报错 — elapsed > launchTimeout 时置 error 并显示超时原因与 URL
OK|健康监测状态机: 停止服务后状态变灰 — monitor 检查 procAlive 为 false 时置 stopped
OK|多应用标签与登录态隔离: 两个应用的登录态互不影响 — 每个应用独立 session 分区 persist:webdeck-<id>，登录态互不串扰且持久
OK|多应用标签与登录态隔离: 快捷键切换标签 — keydown 处理 ⌘1-⌘9 切标签；重复点击侧边栏 activateApp 重新 loadURL 回首页
OK|远程内容安全隔离: 远程页面无法访问 Node API — WebContentsView 使用 sandbox:true + contextIsolation:true，无 nodeIntegration
OK|远程内容安全隔离: 新窗口链接转到系统浏览器 — setWindowOpenHandler 对 http/https 调 shell.openExternal 并 deny
OK|运行状态可视化与操作: 状态灯随监测结果实时变化 — setStatus 通过 IPC apps:status 推送，renderer 更新状态灯
OK|运行状态可视化与操作: 工具栏操作 — tb-toggle 停止/启动对应 stopApp/startApp；tb-reload 调 reloadApp
```
