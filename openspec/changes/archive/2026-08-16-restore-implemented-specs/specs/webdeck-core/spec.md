# WebDeck Core Specification

## ADDED Requirements

### Requirement: 通过 URL 添加应用并配置启动方式

用户可通过侧边栏左上角 ＋ 或 ⌘N 打开添加弹窗，必须提供名称与 URL；URL 可省略协议前缀，自动补全为 http://。启动方式可选：无（仅打开 URL，适合远程站点）、直接命令（可执行文件 + 参数数组）、Shell 命令（整条命令，如 `cd ~/dsh && pnpm dsh`）。可配置工作目录、环境变量（每行 KEY=VALUE）、启动超时、等待健康检查通过后才标记运行中、退出 WebDeck 时结束该进程、切换到该应用时自动启动。

#### Scenario: 添加仅打开 URL 的应用

用户输入名称和 `127.0.0.1:3080`，保存后侧边栏出现该应用，URL 被规范化为 `http://127.0.0.1:3080`，健康检查 URL 默认等于应用 URL。

#### Scenario: 使用 Shell 命令拉起本地服务

用户配置 Shell 命令 `cd ~/dsh && pnpm dsh`，勾选"切换到该应用时自动启动"，打开该应用标签时本地服务被自动拉起，健康检查通过后状态变为运行中。

#### Scenario: 配置校验失败给出错误

用户选择"直接命令"模式但不填可执行文件，或选择"Shell 命令"模式但不填命令，保存时被拒绝并提示原因。

### Requirement: 应用配置持久化

应用配置（名称、URL、启动方式、监测配置）原子写入 userData 目录下的 webdeck.json（临时文件 + rename），重启 WebDeck 后应用列表完整恢复；settings（如最近打开的应用 lastActiveAppId）在应用增删时保留。

#### Scenario: 重启后应用仍在

用户添加应用后退出并重新启动 WebDeck，侧边栏仍显示该应用及其全部配置，无需重新添加。

#### Scenario: 更新与删除均持久化

用户编辑应用名称保存后重启，名称保持更新；删除应用后重启，该应用不再出现。

#### Scenario: 重启后恢复上次打开的应用

用户最后激活的是第二个应用，重启 WebDeck 后自动打开该应用标签。

### Requirement: 本地服务进程生命周期管理

本地命令以 detached 进程组启动；停止时 SIGTERM 整个进程组，2 秒后仍存活则 SIGKILL；退出 WebDeck 时按配置（stopOnQuit）结束进程；stdout/stderr 采集进环形日志缓冲（上限 400 行），可在 UI 中实时查看。

#### Scenario: 停止命令结束整个进程组

用户启动一个会派生子进程的 Shell 命令后点击停止，命令进程及其子进程均被终止，不遗留孤儿进程。

#### Scenario: 查看启动日志

用户打开日志面板，能看到本地进程的 stdout/stderr 输出并自动滚动到最新；日志窗口关闭后停止轮询。

#### Scenario: 退出 WebDeck 清理进程

用户配置了"退出 WebDeck 时结束该进程"的应用正在运行，正常退出（⌘Q/关闭窗口）后该本地服务随之结束。

### Requirement: 健康监测状态机

监测按可配置间隔（默认 5 秒）探测检查 URL 与期望状态码（默认 200）：本地进程已启动但检查未通过且未超时 → starting（黄）；检查通过 → running（绿）；启动超时或进程异常退出 → error（红）；进程未启动或正常退出 → stopped（灰）；纯远程应用（无本地启动）检查失败 → error。超时可配（默认 30 秒）。

#### Scenario: 服务就绪后状态变绿

用户启动本地服务，健康检查通过后状态灯由黄（starting）变绿（running）。

#### Scenario: 启动超时报错

本地进程持续运行但健康检查在超时时间内未通过，状态变为 error 并显示超时原因与检查 URL。

#### Scenario: 停止服务后状态变灰

用户停止本地服务，监测循环探测失败且进程不在运行，状态变为 stopped。

### Requirement: 多应用标签与登录态隔离

每个应用使用独立 session 分区（persist:webdeck-<id>），登录态互不串扰且重启保留；侧边栏点击应用切换标签，重复点击回到首页 URL；⌘1–⌘9 切换标签，应用菜单带勾选态。

#### Scenario: 两个应用的登录态互不影响

用户分别登录两个不同站点，退出并重新打开其中一个，另一个的登录态不受影响。

#### Scenario: 快捷键切换标签

用户按下 ⌘2，主内容区切换到第二个应用；再次点击侧边栏该应用，回到其首页 URL。

### Requirement: 远程内容安全隔离

远程页面运行于 sandbox + contextIsolation（无 Node 能力）；window.open 一律转为系统浏览器打开（deny 内嵌新窗口）；权限按白名单放行（clipboard-read、media、fullscreen、notifications、openExternal、display-capture、keyboardLock 等），其余权限请求被拒绝。

#### Scenario: 远程页面无法访问 Node API

应用内嵌页面尝试访问 process 或 require 失败；页面无法读取本地文件系统。

#### Scenario: 新窗口链接转到系统浏览器

内嵌页面点击带 target=_blank 的链接，系统默认浏览器打开该 URL，WebDeck 内不出现新窗口。

### Requirement: 运行状态可视化与操作

侧边栏每个应用显示状态灯（绿=运行中 / 黄=启动中 / 红=错误 / 灰=停止），悬停显示状态详情；工具栏提供启动/停止、重载（⌘R）、系统浏览器打开、查看日志、编辑；底部状态栏显示当前应用名称与状态详情；状态变化通过 IPC 推送实时更新，无需手动刷新。

#### Scenario: 状态灯随监测结果实时变化

健康检查从失败转为通过时，状态灯自动由红/黄变绿，无需刷新界面。

#### Scenario: 工具栏操作

用户选中应用后点击 ⏹ 停止本地服务，状态灯变灰；点击 ↻ 重载当前应用页面。
