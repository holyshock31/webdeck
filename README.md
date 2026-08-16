# WebDeck（网页甲板）

通用桌面网页包装器：**通过 URL 添加应用**，每个应用可配置**启动方式**（自动拉起本地服务）与**健康监测**（状态灯）。侧边栏标签页形态，跨平台（macOS / Windows / Linux），Electron 实现。

## 快速开始

```bash
npm install        # 若 Electron 二进制下载失败，见下方「常见问题」
npm start          # 启动 WebDeck（scripts/dev.sh 平台分发：macOS 改名 .app 副本，Windows/Linux 直接 electron .）
npm test           # 核心逻辑单测（无需 GUI，三平台通用）
npm run smoke      # 全链路冒烟测试（自动开窗跑一遍后退出）
```

`npm start` 在 macOS 上会生成改名的 `dist/WebDeck.app`（Dock/⌘Tab 显示 WebDeck）；Windows / Linux 直接以 `electron .` 启动（任务栏身份由 `app.setAppUserModelId` 声明）。

## 核心概念：添加应用 = URL + 启动方式 + 监测

应用**不是内置的**，全部由用户添加。侧边栏左上角 **＋**（或 ⌘N）打开添加弹窗：

| 配置项 | 说明 |
|---|---|
| 名称 / URL | 必填。URL 可省略 `http://`，自动补全 |
| 启动方式 | **无**（仅打开 URL，适合远程站点）；**直接命令**（可执行文件 + 参数）；**Shell 命令**（整条命令，如 `cd ~/dsh && pnpm dsh`） |
| 工作目录 / 环境变量 | 传给本地进程（环境变量每行 `KEY=VALUE`） |
| 等健康检查通过后标记运行中 | 本地服务拉起的就绪判定；超时可配（默认 30s） |
| 退出 WebDeck 时结束该进程 | 防止留下孤儿服务（默认开） |
| 切换到该应用时自动启动 | 打开标签即拉起服务（默认开） |
| 健康监测 | 按间隔探测检查 URL，绿=运行中 / 黄=启动中 / 红=错误 / 灰=停止 |

内置两个快捷预设：**DeepSeek Harness**（`pnpm dsh` → `http://127.0.0.1:3080`）和**本地静态服务**（`python -m http.server`，命令按平台自动选择：Windows 用 `python`，macOS/Linux 用 `python3`）。

### 常用操作

- 侧边栏点击应用 = 切换标签（重复点击回到首页 URL）
- 工具栏：▶/⏹ 启动停止本地服务 · ↻ 重载 · ↗ 系统浏览器打开 · ☰ 查看启动日志（实时滚动）· ✎ 编辑
- ⌘1–⌘9 切换标签，⌘R 重载当前应用，⌘⌥I 当前应用开发者工具
- 应用菜单里也可切换（带勾选态）

## 架构

```
src/main/
  index.js          主进程入口：窗口、WebContentsView 标签管理、IPC、菜单、冒烟测试
  apps.js           应用注册表：配置校验/规范化、增删改查、持久化（纯 Node，可单测）
  process-manager.js 本地进程生命周期：spawn(直接/Shell)、平台化终止、日志环形缓冲（纯 Node，可单测）
  monitor.js        健康监测状态机：stopped/starting/running/error（纯 Node，可单测）
  store.js          JSON 原子持久化（userData/webdeck.json）
src/preload/
  preload.cjs       contextBridge 白名单 API（contextIsolation + sandbox，含 platform）
src/renderer/
  index.html / styles.css / app.js   侧边栏 UI（原生 JS，无构建链）
scripts/
  dev.sh           开发态运行入口（平台分发：macOS 改名 .app 副本，其他平台直接 electron .）
  demo-server.js    演示用最小 HTTP 服务（也可当测试靶子）
  test-core.js      核心逻辑端到端单测
```

设计要点：

- **每个应用一个独立 session 分区**（`persist:webdeck-<id>`）：登录态互不串扰、重启保留
- **进程终止的平台适配**：POSIX（macOS/Linux）以 `detached` 进程组启动，停止时 SIGTERM 整组、2 秒后 SIGKILL，不遗留子进程；Windows 用 `taskkill /pid <pid> /T` 终止整棵进程树（必要时 `/F` 强杀），spawn 统一 `windowsHide: true` 不弹控制台窗口
- **Shell 命令的默认 shell 按平台选择**：Windows 用 `%ComSpec%`（cmd.exe `/d /s /c`），macOS/Linux 用 `$SHELL` 或 `/bin/zsh`
- **状态机**：健康检查通过 → `running`；进程在跑但检查未通过 → `starting`（超时转 `error`）；进程退出/未启动 → `stopped`
- **安全**：远程页面运行在 sandbox + contextIsolation 中，无 Node 能力；`window.open` 一律转到系统浏览器；权限按白名单放行

## 状态机

```
            启动命令               健康检查通过
 stopped ────────────► starting ───────────────► running
    ▲                    │ 超时                      │ 检查失败/进程退出
    └────────────────────┴──────────────────────────┴──────► error / stopped
```

## 跨平台使用说明（Windows / Linux）

- **Shell 命令写法**：Windows 用 `%USERPROFILE%` 代替 `~`，跨盘符时用 `cd /d`；示例：`cd /d %USERPROFILE%\dsh && pnpm dsh`。macOS/Linux 维持 `cd ~/dsh && pnpm dsh`
- **中文日志乱码**：Windows 控制台默认 GBK 编码，子进程输出的中文可能乱码；可在 Shell 命令前加 `chcp 65001 >nul &&` 切换为 UTF-8 代码页
- **内置预设**：本地静态服务预设的 `python` 命令按平台自动选择（Windows `python` / macOS、Linux `python3`），也可在添加弹窗里手动修改
- **CI**：`.github/workflows/ci.yml` 在 macOS / Windows / Linux 三平台自动跑 `npm test` 与 `npm run smoke`（Linux 用 `xvfb-run`），任何平台失败都会标红

## 常见问题

- **`npm install` 后 Electron 二进制下载失败（EPERM ~/Library/Caches/electron）**：缓存目录不可写时，用
  `electron_config_cache="$PWD/.electron-cache" node node_modules/electron/install.js` 手动下载（或先 `npm install --ignore-scripts` 再手动跑 install.js）
- **服务已启动但状态一直是 starting**：检查健康检查 URL 与期望状态码（部分服务 302 跳转，把期望码改为 302 或让检查 URL 指向具体接口）
- **Shell 命令里的路径**：工作目录留空时继承 WebDeck 进程的 cwd；建议 `cd <目录> && <命令>` 写法
- **Windows 上停止本地服务的行为差异**：Windows 没有 SIGTERM 进程组语义，停止走 `taskkill /pid <pid> /T`（2 秒后仍存活则 `/F` 强杀）——是强杀语义，与 macOS 的「SIGTERM 优雅退出 → SIGKILL」二段式不同；这是平台差异，不是缺陷
- **Windows 上启动本地服务不弹黑窗**：所有本地进程均以隐藏控制台窗口启动（`windowsHide: true`）；若看到黑色控制台窗口闪出，请确认 WebDeck 版本包含跨平台适配（0.2 起）

## 路线图

- [ ] electron-builder 打包（dmg/zip + NSIS/portable + AppImage，`appId` 待定）
- [x] Windows 运行时适配（进程组终止方式、平台默认命令、三平台 CI）
- [ ] 侧边栏可折叠 / 宽度可调
- [ ] 应用级代理配置、证书忽略开关
- [ ] 托盘图标 + 快捷切换
- [ ] 图标与品牌视觉
