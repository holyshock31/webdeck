# Windows 手动验证清单（support-cross-platform）

> 本清单对应 `openspec/changes/support-cross-platform` 的手动验收方式（spec 中「本地进程启动/终止的平台适配」「Windows 下本地进程日志中文可读」等 Requirement 的场景）。
> 需在真实 Windows 10/11 机器上执行（Windows runner 的 CI 冒烟只覆盖自动化部分）。

## 前置

- [ ] `git clone` 项目后在 Windows 上 `npm install` 成功（Electron 二进制下载正常）
- [ ] `npm test` 全部通过（含测试 9：平台差异纯函数）
- [ ] `npm run smoke` 通过（输出 `SMOKE_OK`，退出码 0）

## 本地服务启动

- [ ] `npm start` 启动 WebDeck（直接 `electron .` 路径，无改名副本逻辑）
- [ ] 添加一个「Shell 命令」应用（如 `python -m http.server 8000`，勾选自动启动与健康监测）
- [ ] 打开该应用标签：**不弹出黑色控制台窗口**（`windowsHide` 生效），健康监测状态由黄（starting）变绿（running）
- [ ] 添加一个「直接命令」应用（可执行文件 + 参数）同样启动成功、不弹控制台窗口

## 本地服务停止与进程树

- [ ] 启动一个会派生子进程的 Shell 命令（如 `cmd /c "python -m http.server 8000"`），点击 ⏹ 停止
- [ ] 打开任务管理器 → 详细信息，核对原进程及其**所有子进程均无残留**（taskkill /T 生效）
- [ ] 对状态为 stopped 的应用再次点击 ⏹，无报错、状态不变（幂等 no-op）

## 健康监测状态流转

- [ ] 服务就绪后状态灯由黄变绿；停止服务后由绿变灰
- [ ] 启动一个监听错误端口/命令的服务，超时后状态变红（error）且显示原因；修正后可重新启动成功

## 中文日志

- [ ] 启动一个输出中文的本地服务（或 Shell 命令前加 `chcp 65001 >nul &&`），打开日志面板中文**逐行正常显示、不乱码**

## 退出清理

- [ ] 勾选「退出 WebDeck 时结束该进程」的本地服务运行中，正常退出 WebDeck，任务管理器核对该服务及其子进程随之结束
- [ ] 未勾选 stopOnQuit 的应用进程在退出后保持运行（行为与配置一致）

## 平台差异观察（非缺陷）

- [ ] 停止本地服务是强杀语义（`taskkill /pid <pid> /T /F` 整棵进程树）——Windows 控制台进程无法温和终止，与 macOS 的 SIGTERM 优雅二段式不同——符合文档说明

## 记录

执行完成后把结果（通过/失败项）写回本清单或提交到 `openspec/changes/support-cross-platform/verify.md`（由 `/spec verify` 生成）。

---

## 直接命令解析（fix-spawn-path-resolution，v0.1.4 起）

- [ ] 直接命令 `dsh --profile web`（nodejs 目录同时存在无扩展名 shim `dsh` 与 `dsh.cmd`）：点击 ▶ 后跳过 shim、命中 `dsh.cmd` 经 cmd 执行，服务拉起、状态变绿
- [ ] 直接命令 `.exe` 应用（如 `notepad.exe`）：直接创建进程执行，参数原样传递
- [ ] 直接命令 `.cmd` 脚本（如 `C:\tools\start-dev.cmd --port 8000`）：经 cmd.exe 执行成功，输出进日志面板
- [ ] 带空格路径/引号参数的直接命令：参数转义正确（日志面板无语法错误、命令正常执行）
- [ ] 不存在的命令：状态 error，日志面板显示 `[spawn error] ENOENT` + `解析过程:` 行（尝试候选数与示例），据此可判断命令名错误
- [ ] GUI 启动 PATH 为空环境（explorer 超长 PATH 丢弃场景）：注册表兜底 PATH 中 `%appdata%\npm`、`%SYSTEMROOT%` 已展开为实际路径（日志面板 PATH 行无字面 `%VAR%`）

---

## 启动链路日志（add-launch-log-chain，v0.1.5 起）

- [ ] Windows 上直接命令 `dsh --profile web` 启动失败后，日志面板显示完整链路：`[launch]`（trigger=manual）、`[env]`（PATH来源）、`[resolve]`（命中路径或未命中候选数）、`[spawn]`（cmd.exe + spawnargs 真实命令行）、`[exit]`（退出码/存活时长）、`[judge]`（error 及 detail）
- [ ] 启动后立即退出的进程：日志面板显示「进程已退出 (code=N, 存活 Xms)」而非空白；再次启动后日志刷新；⏹ 停止后清除
- [ ] 打包版 GUI 启动后 `%APPDATA%\WebDeck\logs\webdeck.log` 存在且包含本次会话的 `[launch]`/`[spawn]`/`[exit]` 链路行（带时间戳）
- [ ] 日志文件超 1MB 轮转为 webdeck.log.1（保留 3 份），当前文件持续可写
- [ ] npm test 与 npm run smoke 三平台 CI 全绿

---

## cmd 执行修复（fix-win-cmd-exec，v0.1.6 起）

- [ ] 直接命令 `dsh --profile web`（命中 `dsh.cmd` 经 cmd.exe 执行）：启动成功，健康检查通过状态变绿——不再报 `'\"...\"' is not recognized`
- [ ] 日志面板 `[spawn]` 链节显示 cmd 收到原样引号语法（`/d /s /c "C:\Program Files\nodejs\dsh.cmd" --profile web`，无反斜杠转义）
- [ ] 启动后立即退出的进程：日志面板「进程已退出 (code=N, 存活 Xms)」的存活时长与 `[exit]` 行一致，等待数秒后重开面板数值不变（冻结）
- [ ] 带空格路径的 `.cmd` 直接命令（如 `C:\tools\my tool.cmd`）：启动成功，路径引号不被转义破坏
- [ ] npm test 与 npm run smoke 三平台 CI 全绿

---

## cmd 双层引号修复（fix-win-cmd-invocation，v0.1.7 起）

- [ ] 直接命令 `dsh --profile web`（命中 `dsh.cmd`）：启动成功，健康检查通过状态变绿——不再报 `'C:\Program' is not recognized`
- [ ] 日志面板 `[spawn]` 链节显示双层引号形态（`argv=... ""C:\Program Files\nodejs\dsh.cmd" --profile web"`）
- [ ] 带空格路径的 `.cmd` 直接命令（如 `C:\tools\my tool.cmd`）：启动成功
- [ ] npm test 与 npm run smoke 三平台 CI 全绿
