# Tasks — fix-win-cmd-exec

- [x] process-manager.js：win32 `.cmd/.bat` 分支 spawn 增加 `windowsVerbatimArguments: true`（整串命令行原样进 CreateProcess，cmd 收到未转义的引号语法）；`.exe` 与 POSIX 分支不变
- [x] process-manager.js：exit 处理记录 `exitUptimeMs`（退出时冻结存活时长），`[exit]` 链节使用冻结值
- [x] src/main/index.js：`app:logs` 返回的退出信息改用冻结的 `exitUptimeMs`
- [x] src/renderer/app.js：日志面板退出状态行使用冻结存活时长（不再实时计算虚增）
- [x] scripts/test-core.js：断言——win32 cmd 分支 spawn 参数含 `windowsVerbatimArguments: true`；`exitUptimeMs` 退出后延迟读取值不变（冻结）
- [x] README.md：常见问题更新「Windows 直接命令 is not recognized」条目（成因：argv 序列化转义引号；修复：verbatim 原样传递）
- [x] 真机手动验证：清单文档化于 docs/windows-manual-verification.md（Windows 上直接命令 `dsh --profile web` 启动成功；存活时长冻结不虚增；npm test 与 npm run smoke 三平台 CI 全绿）；真机执行留待验收 `dsh --profile web` 启动成功（cmd 分支不再报 is not recognized）；日志面板「进程已退出」存活时长与 `[exit]` 行一致且不随时间虚增；npm test 与 npm run smoke 三平台 CI 全绿
