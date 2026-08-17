# Tasks — fix-spawn-path-resolution

- [ ] process-manager.js：新增 `resolveEnvPath()` 纯函数——POSIX 补全 Homebrew / ~/.local/bin / pnpm / npm-global / yarn / bun / nvm 版本目录；win32 补 `C:\Program Files\nodejs`、`%LOCALAPPDATA%\pnpm`、`%APPDATA%\npm`、`%USERPROFILE%\.local\bin`；已存在不重复；分隔符按平台参数
- [ ] process-manager.js：新增 `readRegistryPath()`——win32 从 HKLM+HKCU 读取合并 PATH（正则解析 reg 输出、展开 %VAR%），非 win32 返回 null
- [ ] process-manager.js：launch 的 env 构造接入——用户显式 env 优先 → win32 PATH 为空时注册表兜底 → resolveEnvPath 补全
- [ ] process-manager.js：spawn 失败时日志面板输出诊断上下文（command / cwd / PATH 截断 600 字符）
- [ ] scripts/test-core.js 测试 9：PATH 补全断言（保留原 PATH、不重复追加、win32 分隔符、nodejs 目录）+ readRegistryPath 非 win32 返回 null
- [ ] README.md：常见问题记录打包版命令找不到的说明与绝对路径解法
- [ ] 真机手动验证：macOS Finder 启动打包版可拉起 pnpm 命令；Windows GUI 启动（PATH 为空环境）可拉起 dsh；日志面板在失败时显示 command/cwd/PATH；npm test 与 npm run smoke 三平台 CI 全绿
