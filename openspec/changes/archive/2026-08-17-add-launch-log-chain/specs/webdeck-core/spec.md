# WebDeck Core Specification

## ADDED Requirements

### Requirement: 本地进程启动链路留痕

每次启动本地进程，按固定链节记录日志（写入日志面板与落盘文件）：`[launch]` 触发来源（手动/自动）与配置原文、`[env]` PATH 来源（继承/注册表兜底/补全）与最终值摘要、`[resolve]` win32 直接命令解析结果（命中路径/类型，或未命中尝试列表）、`[spawn]` 可执行文件、参数与 **spawn 序列化后的真实命令行全文**、`[exit]` 退出码/信号/存活时长、`[judge]` 状态判定结果与原因。任一步骤失败时该链节给出直接证据，不再依赖猜测。

#### Scenario: Windows 上启动失败时日志面板显示完整链路

用户在 Windows 上点击 ▶ 启动直接命令 `dsh --profile web`，启动失败后打开日志面板，依次看到 `[launch]`、`[env]`、`[resolve]`、`[spawn]`、`[exit]`、`[judge]` 各行——如 `[spawn]` 显示 cmd.exe 序列化后的真实命令行（含引号转义形态）、`[exit]` 显示退出码与存活时长，据此可直接判断失败发生在解析层还是执行层。

#### Scenario: cmd 转义冲突时真实命令行可见

Windows 上 `.cmd` 命令经 cmd.exe 执行失败时，日志面板的 `[spawn]` 链节显示 `child.spawnargs` 的完整命令行（含引号与转义字符），无需外部工具即可核对 cmd 实际收到的命令行形态。

#### Scenario: 解析未命中时尝试列表可见

win32 直接命令解析未命中时，`[resolve]` 链节显示按 PATH+PATHEXT 尝试的候选数与前几个示例路径，可据此判断是命令名错误还是 PATH 缺失。

### Requirement: 本地进程退出后日志保留

本地进程退出（含非零退出码）后，其日志与退出信息（退出码、信号、存活时长）**保留可见**：日志面板显示「进程已退出 (code=N, 存活 Xs)」而非空白；保留至下次启动（替换）、手动停止或删除应用时清除。spawn 失败 tombstone 语义不变。

#### Scenario: 启动后立即退出的进程日志仍可见

用户在 Windows 上启动一个启动后立即退出的应用（如 cmd 转义错误导致 `dsh.cmd` 执行失败），日志面板仍显示该进程的 stdout/stderr 片段与「进程已退出 (code=9009, 存活 0.1s)」，不会因进程退出而变空白。

#### Scenario: 重新启动后日志刷新

用户修正配置后再次点击 ▶，日志面板显示新一次启动的链路与日志，旧 tombstone 被替换，不残留上一次的退出信息。

#### Scenario: 停止应用清除退出日志

用户点击 ⏹ 停止已退出的应用（tombstone 状态），日志面板退出信息被清除，状态回到 stopped。

### Requirement: 打包版主进程日志落盘

主进程日志（含启动链路行）追加写入 `userData/logs/webdeck.log`，按大小轮转（默认 1MB，保留最近 3 份）；GUI 启动的打包版（无终端）也可查看全量主进程日志。

#### Scenario: 打包版 GUI 启动后日志文件存在

用户在 Windows/macOS 双击启动打包版 WebDeck 并操作（启动/停止应用），`userData/logs/webdeck.log` 存在且包含本次会话的启动链路行（`[launch]`/`[spawn]`/`[exit]` 等），无需终端即可查看。

#### Scenario: 日志文件超限轮转

持续运行使日志超过 1MB 时，旧日志轮转为 `webdeck.log.1` 等编号文件（保留最近 3 份），当前日志文件不中断写入，最新链路行始终可查。
