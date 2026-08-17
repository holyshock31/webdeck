# WebDeck Core Specification

## ADDED Requirements

### Requirement: 更新安装目录与当前安装位置对齐

Windows 安装版自动更新时，更新安装目录与**当前运行 exe 所在目录**对齐（而非 electron-updater 默认的固定安装目录）——用户自定义安装路径后，更新仍装到当前安装位置，不产生"新版装回默认目录、旧版残留"的双实例。

#### Scenario: 自定义安装目录下更新不产生双实例

用户把 WebDeck 安装到自定义路径（如 `D:\Apps\WebDeck`），检测到新版本并点击"立即安装"——更新安装到 `D:\Apps\WebDeck`（当前 exe 目录），启动后为最新版，无第二个默认目录实例。

### Requirement: 关机与退出时停止更新下载

系统关机或应用退出时停止进行中的更新下载（`autoDownload` 置 false）——避免关机途中下载半成品文件导致下次启动更新损坏。

#### Scenario: 关机途中不产生半成品下载

用户下载更新过程中关机，下载被中止，不残留半成品文件；下次启动应用正常，更新检查可重新发起。

### Requirement: 更新事件写入落盘日志

更新服务的检查结果、错误、下载进度、安装等事件写入 `userData/logs/webdeck.log`（与主进程日志同一落盘通道）——GUI 打包版更新失败可从日志排查，无需截图。

#### Scenario: 更新失败可在日志中定位

用户更新失败后打开 `userData/logs/webdeck.log`，看到更新检查/下载/错误的时间戳记录（如 `[updater] error ...`），据此定位失败环节。

### Requirement: 更新下载可取消

进行中的更新下载可经 UI 取消（「取消」按钮 → IPC → `CancellationToken`）——下载卡住或用户改变主意时可中止，取消后应用功能不受影响，可重新检查更新。

#### Scenario: 下载中取消更新

用户点击下载进度提示条的「取消」，下载中止；应用正常使用；再次「检查更新」可重新发起下载。
