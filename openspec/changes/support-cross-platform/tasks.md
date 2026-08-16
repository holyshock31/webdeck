# Tasks — support-cross-platform

- [x] process-manager.js：把终止策略抽为按 `process.platform` 分发的函数——POSIX 保持现状（detached 进程组 + SIGTERM 整组、2 秒后 SIGKILL），win32 构造 `taskkill /pid <pid> /T`（必要时 `/F`）命令执行，失败时回退 `child.kill`
- [x] process-manager.js：`stop` 与 `stopMany` 均改走平台分发后的终止策略，保证 Windows 上停止应用与退出 WebDeck 都能终止整棵进程树
- [x] process-manager.js：直接命令与 Shell 两种模式的 `spawn` 统一加 `windowsHide: true`
- [x] process-manager.js：Shell 模式默认 shell 按平台选择——win32 用 `process.env.ComSpec`（cmd.exe `/d /s /c`），POSIX 维持 `process.env.SHELL || '/bin/zsh'`
- [x] scripts/dev-mac.sh 重命名为 scripts/dev.sh：非 darwin 直接 `electron .`，macOS 保留改名 .app 副本逻辑（含版本变化自动重建），更新文件头注释
- [x] package.json：`start` 脚本指向 `scripts/dev.sh`（`bash scripts/dev.sh`）
- [x] src/renderer/app.js：内置预设按平台给默认命令——本地静态服务 macOS/Linux 为 `python3 -m http.server 8000`、Windows 为 `python -m http.server 8000`；平台信息经 preload 桥（contextBridge）暴露给渲染层，不直接依赖 navigator 推断
- [x] scripts/test-core.js：为平台差异逻辑补充纯 Node 单测（如 shell 解析、Windows 终止命令构造），不依赖真实平台即可验证
- [x] 新增 .github/workflows/ci.yml：三平台矩阵（macos-latest / windows-latest / ubuntu-latest）执行 `npm test` 与 `npm run smoke`，Linux runner 用 `xvfb-run` 提供虚拟显示
- [x] README.md：更新快速开始与架构说明（dev.sh 平台分发）、Windows 使用说明（Shell 命令 `%USERPROFILE%` / `cd /d` 写法、中文日志 `chcp 65001` 提示）、常见问题补充 Windows 平台差异说明
- [x] Windows 手动验证清单：清单文档化于 docs/windows-manual-verification.md（添加本地服务应用并启动——不弹控制台窗口、健康监测状态由黄转绿；停止后无孤儿进程残留（任务管理器核对进程树）；日志面板中文不乱码；退出 WebDeck 后配置了 stopOnQuit 的本地服务随之结束；npm test 与 npm run smoke 在三平台 CI 全绿）；真机执行留待 Windows 机器验收
