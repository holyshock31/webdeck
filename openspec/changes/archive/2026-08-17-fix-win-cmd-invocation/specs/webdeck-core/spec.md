# WebDeck Core Specification

## MODIFIED Requirements

### Requirement: Windows 直接命令模式的可执行文件解析

Windows 上「直接命令」启动方式使用自实现的可执行文件解析：按 PATH 顺序 + PATHEXT 查找——**跳过无扩展名且非可执行的文件**（npm 等工具生成的无扩展名 shim 会导致 libuv 原样命中后 CreateProcess 失败报 ENOENT 的陷阱），命中 `.exe` / `.com` 直接执行，命中 `.cmd` / `.bat` 转经 cmd.exe（`/d /s /c`）执行；**经 cmd.exe 执行时以 `windowsVerbatimArguments` 原样传递整串命令行**（含路径引号），避免 Node argv 序列化把引号转义为 `\"`，且**命令行为双层引号包裹**（`"` + 命令行 + `"`）——cmd 的 `/S` 规则会剥掉首引号，单层引号会使路径失去保护、命令名按空格拆分（如 `'C:\Program' is not recognized`），双层引号让 cmd 剥掉外层后内层引号完整保留（`child_process.exec` 与 npm cmd-shim 的标准做法）；未命中时报 ENOENT 且诊断信息记录尝试过的目录。POSIX（macOS / Linux）行为不变（直接 spawn，无扩展名文件本身可执行）。

#### Scenario: Windows 上 npm 全局工具可直接命令启动

用户在 Windows 上配置直接命令 `dsh --profile web`（`C:\Program Files\nodejs` 下同时存在无扩展名 shim `dsh` 与 `dsh.cmd`），点击 ▶ 后命令解析跳过无扩展名 shim、命中 `dsh.cmd`，经 cmd.exe 以双层引号命令行执行（不出现 `'\"...\"' is not recognized` 或 `'C:\Program' is not recognized` 报错），本地服务正常拉起，健康检查通过后状态灯变绿。

#### Scenario: Windows 上 .exe 应用直接执行

用户配置直接命令 `notepad.exe`（或带参数），点击 ▶ 后直接创建进程执行，不经 cmd.exe，参数原样传递。

#### Scenario: Windows 上 .cmd 应用可启动

用户配置直接命令指向一个 `.cmd` 脚本（如 `C:\tools\start-dev.cmd --port 8000`），点击 ▶ 后经 cmd.exe 执行成功（带引号的路径经双层引号保护，不被 `/S` 剥引号破坏），命令输出进入日志面板。

#### Scenario: 命令未命中时报错并给出解析过程

用户配置一个不存在的直接命令，点击 ▶ 后状态变为 error，日志面板显示 `[spawn error] ENOENT` 且记录解析过程（按 PATH 尝试过的目录、跳过/命中的文件），据此可直接判断命令名错误还是 PATH 缺失。

#### Scenario: macOS 直接命令行为不变

用户在 macOS 上配置直接命令（如 `python3 -m http.server`），仍直接 spawn 执行（POSIX 无扩展名文件本身可执行），行为与现状一致。
