# Proposal — fix-spawn-path-resolution

## Why

Windows 真机上「WebDeck 无法启动本地应用（直接命令 `dsh --profile web` 报 ENOENT）、cmd 手动执行成功」的问题，经零侵入诊断脚本（`diag-win-path.mjs`，临时脚本已弃）定位，**根因不是 PATH**，而是 **Node.js `spawn()` 在 Windows 上的命令解析缺陷**：

- 诊断脚本步骤 1（决定性证据）：**cmd 完整环境**（PATH 1648 字符、PATHEXT 齐全、`where dsh` 可找到）下，`spawnSync('dsh')` **照样 ENOENT**
- `where dsh` 输出两个文件：`C:\Program Files\nodejs\dsh`（**无扩展名 shim**，npm 生成）与 `C:\Program Files\nodejs\dsh.cmd`（真正的 Windows shim）
- 机制：libuv 按 PATH 搜索时**原样命中无扩展名文件 `dsh`**，CreateProcess 无法执行非 PE 文件 → 直接 ENOENT，**不会继续尝试 `dsh.cmd`**；cmd.exe 的解析规则不同（能正确落到 `.cmd`），所以 cmd 手动执行成功、`where` 只查找不执行也成功
- 这解释了 macOS 正常（POSIX 无扩展名 shim 本身可执行）与 Windows 失败的差异

过程中暴露的次级问题（v0.1.1-v0.1.3 已发布，本变更一并修正）：

- **macOS 打包版**（Finder/Dock 启动）：GUI 应用 PATH 只有系统默认目录，`pnpm dsh` 等命令 spawn 失败——`resolveEnvPath()` 补全已修复（保留）
- **Windows GUI 启动 PATH 可能为空**（explorer 对超长 PATH 的处理问题）：注册表兜底已实现（保留为防御性改进），但其 **`%VAR%` 展开存在大小写 bug**（`%appdata%` vs `APPDATA`、`%SYSTEMROOT%` vs 映射键 `SystemRoot`，全部 miss，产生无效 PATH 条目）——本变更修复
- **诊断缺口**：spawn 失败时日志只有一行 `ENOENT`，无法区分「命令找不到 / cwd 无效 / PATH 缺失 / 解析缺陷」——v0.1.2 已加 command/cwd/PATH 诊断，本变更进一步记录**解析尝试过程**

## What Changes

- `src/main/process-manager.js` 新增 **win32 直接命令解析**纯函数（核心修复）：`resolveWinCommand(command, env)` 按 PATH 顺序 + PATHEXT 查找可执行文件——
  - **跳过无扩展名且非可执行的文件**（npm 无扩展名 shim 陷阱）
  - 命中 `.exe` / `.com` → 返回直接执行
  - 命中 `.cmd` / `.bat` → 返回经 cmd.exe 执行（`cmd /d /s /c` + 参数）
  - 全部未命中 → 返回 null，供调用方报 ENOENT 并给出尝试过的目录列表
- `src/main/process-manager.js`：launch 直接命令模式在 win32 上改用上述解析——`.exe/.com` 直接 spawn；`.cmd/.bat` 转 `spawn(ComSpec, ['/d','/s','/c', path, ...args])`；参数含引号/空格时按 cmd 规则转义；POSIX 行为不变（直接 spawn）
- `src/main/process-manager.js`：修复 `readRegistryPath()` 的 `%VAR%` 展开大小写问题（`env` 查大小写不敏感、已知映射补全大小写变体），`%appdata%\npm`、`%SYSTEMROOT%` 等正确展开
- `src/main/process-manager.js`：spawn 失败诊断日志增强——win32 直接命令模式记录**解析过程**（PATH 顺序尝试的目录、跳过无扩展名文件、命中路径），ENOENT 时日志直接定性
- `resolveEnvPath()` 补全、注册表兜底保留（v0.1.1/v0.1.3 已实现，本变更仅修展开 bug）
- 测试：`scripts/test-core.js` 测试 9 补充 `resolveWinCommand` 单测（无扩展名 shim 跳过、`.cmd` 命中、`.exe` 命中、未命中返回 null、参数转义）
- 文档：README 常见问题更新——「Windows 直接命令找不到」的成因说明（无扩展名 shim）与 Shell 命令绝对路径解法

## Impact

- **运行时行为**：Windows 直接命令模式的解析行为变化（从裸 spawn 改为自实现解析）——修复 npm/其他工具的无扩展名 shim 导致的 ENOENT；`.cmd/.bat` 从「不可用」变为「可用」；POSIX 与 Shell 模式行为不变；macOS/Linux 无感知
- **模块边界**：`process-manager.js` 维持纯 Node 可单测；`resolveWinCommand` 为纯函数（平台参数注入，测试环境可验证）
- **兼容性**：无持久化 schema、无 IPC、无 UI 变化；直接命令参数语义不变（数组传递，转义仅影响 cmd 分支）
- **风险**：cmd 参数转义（引号/`%`/`^`）是 Windows 经典坑，需真机验证 `dsh --profile web` 与带空格/引号参数的场景；解析顺序与 cmd 原生规则（PATHEXT 顺序）保持一致
- **范围边界**：不改变 Shell 模式、终止策略、健康监测；不含打包/签名（另立变更）；验收方式为三平台 CI 全绿 + Windows 真机（dsh 直接命令可启动、`.cmd` 应用可用）手动验证

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
