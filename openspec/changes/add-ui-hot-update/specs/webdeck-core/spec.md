# WebDeck Core Specification

## ADDED Requirements

### Requirement: 壳 UI 独立版本化与加载解析

壳 UI（index.html / styles.css / app.js / expand-button.html / find-bar.html / icons/）具有独立版本；打包版加载时按「已应用版本目录 → 内置」两级解析：`settings.uiVersion` 指向的 `userData/ui/<version>/` 存在且 `settings.appliedAppVersion` 等于当前应用版本时使用该目录，否则使用 asar 内置的 `src/renderer/`。preload 脚本（`src/preload/*.cjs`）始终从 asar 加载，不参与版本化。开发态（未打包）不做任何解析，永远加载内置 UI。

#### Scenario: 打包版应用了热更新 UI 后加载新目录

用户在打包版中应用了 UI 版本 2026.08.17.2，重启 WebDeck 后壳 UI 从 `userData/ui/2026.08.17.2/` 加载，界面为新版本，应用列表与状态灯正常恢复。

#### Scenario: 无已应用版本时使用内置 UI

全新安装的打包版（settings 无 uiVersion）加载 asar 内置 UI，行为与引入本功能前一致。

#### Scenario: 整包升级后自动回内置 UI

用户应用过热更新 UI（appliedAppVersion=0.1.8），随后整包升级到 0.2.0——启动时当前应用版本 ≠ appliedAppVersion，加载内置 UI，随后 UI 检查按新版本重新应用兼容的最新热更新 UI。

#### Scenario: 开发态不受影响

开发者以 `npm start` 运行（未打包），壳 UI 永远从 `src/renderer/` 加载，不发起任何 UI 更新检查，smoke 测试行为不变。

### Requirement: UI 热更新拉取与校验

打包版启动时异步检查 UI 更新（TTL 默认 24 小时，缓存期内不重复拉取）：拉取 manifest（默认源 `https://raw.githubusercontent.com/holyshock31/webdeck/main/docs/ui/latest.json`）→ schema 校验 → `minAppVersion` 门槛（当前应用版本低于 minAppVersion 时跳过）→ 与已应用版本比较 → 按清单逐文件拉取（`<源>/<ref>/<path>`）并逐文件 sha256 校验 → 全部成功后写入新的 `userData/ui/<version>/` 目录并切换版本指针、重载壳 UI；任一步失败（网络、校验、写入）丢弃新目录、保留旧版本静默回退。自动检查失败不打扰用户。

#### Scenario: 启动时自动应用新 UI

打包版启动，manifest 版本高于已应用版本且 minAppVersion 满足，所有文件 sha256 校验通过——壳 UI 自动切换为新版本并重载，本地服务、标签页、状态灯不受影响。

#### Scenario: manifest 校验失败保留旧版本

manifest 结构非法（files 非数组、path 含 `..` 或绝对路径）——更新被拒绝，继续使用当前 UI，不产生错误提示。

#### Scenario: 文件校验失败丢弃新目录

manifest 合法但某个文件 sha256 不符或下载中断——新版本目录被丢弃，已应用版本继续使用，下次检查再试。

#### Scenario: minAppVersion 门槛

manifest 的 minAppVersion 高于当前应用版本（新 UI 依赖更新的主进程 IPC）——跳过该 UI 更新，继续使用当前 UI，不破坏运行。

#### Scenario: TTL 内不重复检查

启动后 24 小时内再次启动 WebDeck，不发起 manifest 拉取，直接使用现有状态。

### Requirement: UI 应用确认与自动回滚

新 UI 应用后，渲染层初始化完成须发送 `ui:ready` 握手：主进程 15 秒超时未收到、或壳 UI `render-process-gone`、或 `did-fail-load`，判定新 UI 不可用——自动回滚到上一版本目录并重载；保留最近 2 个版本目录。回滚不丢失任何应用状态（应用配置、进程、标签均在主进程）。

#### Scenario: 新 UI 正常启动

新 UI 应用后渲染层 3 秒内完成初始化并发送 ui:ready，无回滚发生，界面正常交互。

#### Scenario: 新 UI 崩溃自动回滚

用户应用的新 UI 在加载时渲染进程崩溃（render-process-gone）——主进程自动回滚到上一版本 UI 并重载，应用数据无丢失。

#### Scenario: 握手超时自动回滚

新 UI 加载后 15 秒内未发送 ui:ready（如 JS 初始化死循环）——自动回滚上一版本并重载。

### Requirement: 手动检查与源可配置

帮助菜单提供「检查界面更新…」：手动触发立即拉取（绕过 TTL），明确反馈结果（已是最新 / 更新成功 / 失败原因）；自动检查保持静默。`settings.uiFeedUrl` 可覆盖 manifest 源（默认 GitHub raw；http 协议仅允许回环地址如 `http://127.0.0.1:8080/latest.json`，用于本地验证）。开发态禁用全部 UI 更新能力（菜单项隐藏或点击提示不可用）。

#### Scenario: 手动检查明确反馈

用户点击「检查界面更新…」且 manifest 无更高版本——提示「已是最新版本」；有更新时下载并应用后提示更新成功。

#### Scenario: 手动检查失败可见

用户断网点击「检查界面更新…」——提示失败原因，当前 UI 不受影响。

#### Scenario: 本地源验证

用户在 settings 配置 `uiFeedUrl` 指向本机 HTTP 服务（127.0.0.1），重启后 UI 更新从该源拉取，可用于发布前验证。

### Requirement: UI 内容安全边界

UI 热更新包**只包含** `src/renderer/**` 静态内容，**不包含** preload 脚本——preload（白名单 API 桥）永远从 asar 加载，不可被热更新替换；UI 只能通过 preload 白名单 API 与主进程通信，权限与内置 UI 完全一致。manifest 经 HTTPS + 逐文件 sha256 校验，路径白名单禁止 `..` 与绝对路径（无写入包目录之外的能力）。

#### Scenario: 恶意 manifest 无法替换 preload

攻击者控制的 manifest 尝试把文件路径指向 `../preload/preload.cjs`——路径校验拒绝（仅允许 src/renderer/**），该清单整体无效，白名单 API 桥保持 asar 原版。

#### Scenario: 热更新 UI 权限与内置一致

热更新 UI 无法调用白名单之外的任何能力（无 Node、无任意 IPC），其行为上限与内置 UI 相同。
