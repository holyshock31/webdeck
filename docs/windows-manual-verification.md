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

- [ ] 停止本地服务的终止是强杀语义（taskkill /T，必要时 /F），与 macOS 的 SIGTERM 优雅二段式不同——符合文档说明

## 记录

执行完成后把结果（通过/失败项）写回本清单或提交到 `openspec/changes/support-cross-platform/verify.md`（由 `/spec verify` 生成）。
