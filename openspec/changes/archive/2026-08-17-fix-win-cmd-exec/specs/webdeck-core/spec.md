# WebDeck Core Specification

## MODIFIED Requirements

### Requirement: Windows 直接命令模式的可执行文件解析

Windows 上「直接命令」启动方式使用自实现的可执行文件解析：按 PATH 顺序 + PATHEXT 查找——**跳过无扩展名且非可执行的文件**（npm 等工具生成的无扩展名 shim 会导致 libuv 原样命中后 CreateProcess 失败报 ENOENT 的陷阱），命中 `.exe` / `.com` 直接执行，命中 `.cmd` / `.bat` 转经 cmd.exe（`/d /s /c`）执行；**经 cmd.exe 执行时以 `windowsVerbatimArguments` 原样传递整串命令行**（含路径引号），避免 Node argv 序列化把引号转义为 `\"` 导致 cmd 报「is not recognized」；未命中时报 ENOENT 且诊断信息记录尝试过的目录。POSIX（macOS / Linux）行为不变（直接 spawn，无扩展名文件本身可执行）。

#### Scenario: Windows 上 npm 全局工具可直接命令启动

用户在 Windows 上配置直接命令 `dsh --profile web`（`C:\Program Files\nodejs` 下同时存在无扩展名 shim `dsh` 与 `dsh.cmd`），点击 ▶ 后命令解析跳过无扩展名 shim、命中 `dsh.cmd`，经 cmd.exe 以原样命令行执行（不出现 `'\"...\"' is not recognized` 报错），本地服务正常拉起，健康检查通过后状态灯变绿。

#### Scenario: Windows 上 .exe 应用直接执行

用户配置直接命令 `notepad.exe`（或带参数），点击 ▶ 后直接创建进程执行，不经 cmd.exe，参数原样传递。

#### Scenario: Windows 上 .cmd 应用可启动

用户配置直接命令指向一个 `.cmd` 脚本（如 `C:\tools\start-dev.cmd --port 8000`），点击 ▶ 后经 cmd.exe 执行成功（带引号的路径不被转义破坏），命令输出进入日志面板。

#### Scenario: 命令未命中时报错并给出解析过程

用户配置一个不存在的直接命令，点击 ▶ 后状态变为 error，日志面板显示 `[spawn error] ENOENT` 且记录解析过程（按 PATH 尝试过的目录、跳过/命中的文件），据此可直接判断命令名错误还是 PATH 缺失。

#### Scenario: macOS 直接命令行为不变

用户在 macOS 上配置直接命令（如 `python3 -m http.server`），仍直接 spawn 执行（POSIX 无扩展名文件本身可执行），行为与现状一致。

### Requirement: 本地进程退出后日志保留

本地进程退出（含非零退出码）后，其日志与退出信息（退出码、信号、**退出时冻结的存活时长**）**保留可见**：日志面板显示「进程已退出 (code=N, 存活 Xs)」而非空白，存活时长在退出瞬间记录、不随时间虚增；保留至下次启动（替换）、手动停止或删除应用时清除。spawn 失败 tombstone 语义不变。

#### Scenario: 启动后立即退出的进程日志仍可见

用户在 Windows 上启动一个启动后立即退出的应用（如 cmd 转义错误导致 `dsh.cmd` 执行失败），日志面板仍显示该进程的 stdout/stderr 片段与「进程已退出 (code=1, 存活 0.1s)」，不会因进程退出而变空白。

#### Scenario: 退出状态行的存活时长不虚增

用户启动一个立即退出的应用并等待数秒后打开日志面板，面板显示的存活时长与进程实际存活时长一致（等于退出时冻结值），不随打开面板的时间推移变大。

#### Scenario: 重新启动后日志刷新

用户修正配置后再次点击 ▶，日志面板显示新一次启动的链路与日志，旧 tombstone 被替换，不残留上一次的退出信息。

#### Scenario: 停止应用清除退出日志

用户点击 ⏹ 停止已退出的应用（tombstone 状态），日志面板退出信息被清除，状态回到 stopped。
