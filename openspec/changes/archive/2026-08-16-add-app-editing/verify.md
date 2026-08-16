# Verification — add-app-editing

Date: 2026-08-16T18:50:37.861Z
Change: openspec/changes/add-app-editing
Model: deepseek-official / deepseek-v4-flash (flash)

**7/7 scenarios passed**

## Scenarios

| # | Result | Requirement | Scenario | Reason |
|---|--------|-------------|----------|--------|
| 1 | ✅ | 编辑已有应用配置 | 打开编辑弹窗并预填当前配置 | 工具栏✎按钮绑定openEditModal，弹窗标题设为"编辑应用"并预填所有配置字段（含命令、超时、监测间隔） |
| 2 | ✅ | 编辑已有应用配置 | 修改名称与 URL 后保存生效 | submit调用webdeck.updateApp更新配置，主进程apps.update持久化并广播apps:changed，渲染层refreshApps刷新侧边栏显示新名称 |
| 3 | ✅ | 编辑已有应用配置 | 编辑后配置持久化 | apps.update调用persist()写入store，store.save原子写入webdeck.json，重启后load()读取持久化配置 |
| 4 | ✅ | 编辑时配置校验 | 编辑时清空 URL 被拒绝 | normalizeApp对空URL抛"URL 不能为空"错误，submit捕获异常弹出alert，不执行更新保持原配置 |
| 5 | ✅ | 编辑时配置校验 | 编辑时 Shell 命令为空被拒绝 | normalizeApp对mode为shell且commandLine为空抛错，保存被拒绝并提示原因，原配置不变 |
| 6 | ✅ | 编辑与进程/监测联动 | 修改启动命令后旧进程被清理 | apps:update处理中先await procs.stop(app)停止旧进程，monitor.start(app)按新配置重启监测，activateApp按startOnOpen自动拉起新进程 |
| 7 | ✅ | 编辑与进程/监测联动 | 修改监测配置后立即生效 | 编辑保存后monitor.start(app)以新配置（URL/间隔/期望状态码）重新启动监测循环并立即tick探测 |

## Raw judge output

```
OK|编辑已有应用配置: 打开编辑弹窗并预填当前配置 — 工具栏✎按钮绑定openEditModal，弹窗标题设为"编辑应用"并预填所有配置字段（含命令、超时、监测间隔）

OK|编辑已有应用配置: 修改名称与 URL 后保存生效 — submit调用webdeck.updateApp更新配置，主进程apps.update持久化并广播apps:changed，渲染层refreshApps刷新侧边栏显示新名称

OK|编辑已有应用配置: 编辑后配置持久化 — apps.update调用persist()写入store，store.save原子写入webdeck.json，重启后load()读取持久化配置

OK|编辑时配置校验: 编辑时清空 URL 被拒绝 — normalizeApp对空URL抛"URL 不能为空"错误，submit捕获异常弹出alert，不执行更新保持原配置

OK|编辑时配置校验: 编辑时 Shell 命令为空被拒绝 — normalizeApp对mode为shell且commandLine为空抛错，保存被拒绝并提示原因，原配置不变

OK|编辑与进程/监测联动: 修改启动命令后旧进程被清理 — apps:update处理中先await procs.stop(app)停止旧进程，monitor.start(app)按新配置重启监测，activateApp按startOnOpen自动拉起新进程

OK|编辑与进程/监测联动: 修改监测配置后立即生效 — 编辑保存后monitor.start(app)以新配置（URL/间隔/期望状态码）重新启动监测循环并立即tick探测
```
