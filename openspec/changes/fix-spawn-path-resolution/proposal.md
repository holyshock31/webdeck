# Proposal — fix-spawn-path-resolution

## Why

打包版（GUI 启动）在 macOS 与 Windows 上均出现「本地应用无法启动」问题，真机证据链如下：

- **macOS 打包版**（Finder/Dock 启动）：GUI 应用 PATH 只有系统默认目录（`/usr/bin:/bin:/usr/sbin:/sbin`），不含 Homebrew / pnpm / nvm 等用户工具路径——`pnpm dsh` 等 Shell 命令 spawn 失败（`command not found`）；开发态 `npm start` 从终端启动继承完整 PATH 所以正常
- **Windows 打包版**（安装版 + cmd 启动的 portable 版同样复现）：spawn 诊断日志显示进程内 `process.env.PATH` **完全为空**（连 `C:\Windows\system32` 都没有）——explorer 环境快照把超长 PATH（该用户 40+ 目录、3000+ 字符）整体丢弃的已知问题；cmd 从注册表实时合并 PATH，所以手动执行成功
- **诊断缺口**：spawn 失败时日志只有一行 `ENOENT`，无法区分「命令找不到 / cwd 无效 / PATH 缺失」，定位依赖猜测

## What Changes

- `src/main/process-manager.js` 新增 `resolveEnvPath()` 纯函数：launch 前在现有 PATH 基础上**补全常见用户 bin 目录**（已存在不重复追加）——POSIX：`/opt/homebrew/bin`、`/usr/local/bin`、`~/.local/bin`、`~/.local/share/pnpm`、npm-global、yarn、bun、nvm 版本目录（扫描 `~/.nvm/versions/node/*`）；win32：`C:\Program Files\nodejs`（npm 全局 prefix 常见位置）、`%LOCALAPPDATA%\pnpm`、`%APPDATA%\npm`、`%USERPROFILE%\.local\bin`；分隔符按平台参数（`;` / `:`），不依赖运行平台
- `src/main/process-manager.js` 新增 `readRegistryPath()`：win32 且 `process.env.PATH` 为空时，从注册表读取 HKLM（系统）+ HKCU（用户）PATH 合并（正则解析 `reg query` 输出、展开 `%VAR%`），作为 explorer 快照丢失 PATH 的兜底；非 win32 返回 null
- `src/main/process-manager.js`：launch 的 env 构造顺序——用户显式配置的 env（含 PATH）优先 → win32 PATH 为空时注册表兜底 → `resolveEnvPath()` 补全
- `src/main/process-manager.js`：spawn 失败时日志面板输出**诊断上下文**（command 全文 / cwd / PATH 截断 600 字符），定位 ENOENT 不再靠猜
- 测试：`scripts/test-core.js` 测试 9 补充 PATH 补全（保留原 PATH、不重复、win32 分隔符、nodejs 目录）与 `readRegistryPath` 非 win32 返回 null 的断言
- 文档：README 常见问题记录「打包版里命令找不到」的说明与非常规路径的解法（绝对路径）

## Impact

- **运行时行为**：PATH 补全与注册表兜底只增不减（在现有 PATH 基础上追加缺失目录，用户显式配置优先），不改变命令解析结果正确时的行为；macOS / Linux / Windows 开发态（终端启动，PATH 完整）无感知
- **模块边界**：`process-manager.js` 维持纯 Node 可单测；`resolveEnvPath` / `readRegistryPath` 为可单测纯函数（注册表读取仅在 win32 生效，测试环境（非 win32）返回 null 不触碰 reg）
- **兼容性**：无持久化 schema、无 IPC、无 UI 变化；`readRegistryPath` 的 `reg query` 输出解析依赖正则兼容各语言环境（中文系统输出格式同结构，需真机验证）
- **风险**：注册表 PATH 合并若解析失败则回退为仅补全目录（不会更坏）；超长 PATH 属于少数用户环境，兜底是防御性改进
- **范围边界**：不改变 shell 选择、终止策略、健康监测；不含 Windows 打包/签名（另立变更）；验收方式为三平台 CI 全绿 + 真机（mac Finder 启动 / Windows GUI 启动）手动验证

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
