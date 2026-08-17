# Tasks — fix-win-cmd-invocation

- [x] process-manager.js：新增 `winCmdInvocationArgs(path, args)` 纯函数——返回 `['/d','/s','/c', '"' + winCmdLine(path, args) + '"']`（外层引号包裹，cmd /S 剥外层后内层完整）
- [x] process-manager.js：win32 `.cmd/.bat` 分支改用 `winCmdInvocationArgs` 构造 argv（保持 `windowsVerbatimArguments: true`）；`.exe` / POSIX / Shell 分支不变
- [x] scripts/test-core.js：断言——winCmdInvocationArgs 双层引号形态（含空格路径、带参数、含内部引号翻倍）；cmd 分支 argv 末元素为外层包裹形态
- [x] README.md：常见问题「Windows 直接命令 is not recognized」条目更新为完整成因链（argv 序列化转义 → cmd /S 剥首引号 → 双层引号解决）
- [x] 真机手动验证：清单文档化于 docs/windows-manual-verification.md（Windows 上直接命令 `dsh --profile web` 启动成功；双层引号形态可见；npm test 与 npm run smoke 三平台 CI 全绿）；真机执行留待验收 `dsh --profile web` 启动成功（`[spawn]` 链节显示双层引号形态，不再报 `'C:\Program' is not recognized`）；带空格路径 `.cmd` 命令可启动；npm test 与 npm run smoke 三平台 CI 全绿
