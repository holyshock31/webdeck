# Tasks — fix-spawn-path-resolution

- [x] process-manager.js：新增 `resolveWinCommand(command, env)` 纯函数——按 PATH 顺序 + PATHEXT 查找，跳过无扩展名非可执行文件（npm shim 陷阱），命中 `.exe/.com` 返回直接执行、`.cmd/.bat` 返回经 cmd 执行、未命中返回 null
- [x] process-manager.js：launch 直接命令模式 win32 分支接入 `resolveWinCommand`——`.exe/.com` 直接 spawn；`.cmd/.bat` 转 `spawn(ComSpec, ['/d','/s','/c', path, ...args])`，参数按 cmd 规则转义（引号/`%`/`^`）；POSIX 行为不变
- [x] process-manager.js：修复 `readRegistryPath()` 的 `%VAR%` 展开大小写问题（env 大小写不敏感 + 已知映射补大小写变体），`%appdata%\npm`、`%SYSTEMROOT%` 正确展开
- [x] process-manager.js：spawn 失败诊断日志增强——win32 直接命令模式记录解析过程（尝试过的目录、跳过原因、命中路径）
- [x] scripts/test-core.js 测试 9：`resolveWinCommand` 单测——无扩展名 shim 跳过、`.cmd` 命中、`.exe` 命中、未命中 null、PATH 顺序与 PATHEXT 生效；注册表展开大小写修复断言
- [x] README.md：常见问题更新——Windows 直接命令 ENOENT 的成因（无扩展名 shim）与解法（Shell 命令绝对路径 / `dsh.cmd` 写法）
- [x] 真机手动验证：Windows 上直接命令 `dsh --profile web` 可启动（无扩展名 shim 环境）；`.cmd` 应用（如 npm 全局工具）可启动；带空格路径/引号参数命令可启动；日志面板失败时显示解析过程；npm test 与 npm run smoke 三平台 CI 全绿
