# WebDeck Core Specification

## ADDED Requirements

### Requirement: 预设来源为可更新的远程源（内置兜底）

「添加应用」弹窗的预设由**内置兜底 + 远程 feed 缓存**两层组成：内置预设编译进应用（零网络可用），远程 feed 为版本化 JSON（默认源为仓库内 `docs/presets.json` 的 GitHub raw 直连）；主进程启动时异步拉取 feed（不阻塞启动），校验通过后原子写入 `userData/presets.json` 缓存并合并到内存；`presets:list` 从内存同步返回（弹窗打开零等待）。远程 feed 与内置预设按 id 合并：同 id 远程覆盖内置，新 id 追加；远程拉取失败时使用上次缓存，无缓存时仅内置预设——最坏情况等价于引入本功能前的行为。

#### Scenario: 首次启动（无网络）弹窗仍有内置预设

用户断网首次启动 WebDeck 并打开「添加应用」弹窗，预设下拉仍显示 DeepSeek Harness 与本地静态服务两个内置预设，选择后可正常填表并保存。

#### Scenario: 拉取成功后新预设无需发版即出现

用户联网启动 WebDeck（或点击刷新），远程 feed 中新增的预设（如「Jupyter Lab」）出现在添加弹窗预设下拉中，选择后表单按 feed 字段预填——该过程不涉及 WebDeck 版本升级。

#### Scenario: 同 id 预设远程优先

远程 feed 与内置预设都含 id 为 `static` 的条目且命令不同，弹窗中 `static` 预设按远程版本显示。

#### Scenario: 拉取失败时回退缓存与内置

用户上次成功拉取过 feed，本次启动网络不可用——弹窗预设下拉显示上次缓存内容（含远程新增预设）；全新安装且无缓存时显示内置预设，不报错、不影响添加流程。

### Requirement: feed 数据校验与安全

远程 feed 只提供表单字段值、不执行任何代码；feed 整体须通过 schema 校验（`version` 为字符串、`presets` 为数组；每条：`id`/`name`/`url` 必填字符串，`url` 协议仅 http/https，`launch.mode` 为 none/direct/shell 且组合校验与添加弹窗一致——direct 必填 `command`、shell 必填 `commandLine`，`monitor` 可选且字段类型合法，未知字段丢弃）。整体非法（JSON 解析失败、结构不符）时拒绝该 feed 并保留旧缓存；单条非法时丢弃该条、其余正常显示。

#### Scenario: 非法 feed 被整体拒绝且保留旧缓存

远程源返回结构不符的 JSON（如 `presets` 非数组），WebDeck 拒绝该 feed，预设列表保持上次缓存内容，不出现损坏条目。

#### Scenario: 非法条目被丢弃、合法条目正常

feed 中一条预设缺少 `name`、其余条目合法——弹窗只显示合法条目，不显示空名条目，不影响其他预设选择。

#### Scenario: 预设只填充表单字段

用户选择任一远程预设，弹窗各字段被预填（名称/URL/启动方式/命令/监测），WebDeck 不执行 feed 中任何命令或脚本，保存时走与手动填写完全相同的校验与持久化路径。

#### Scenario: 平台差异命令按本机平台选择

Windows 上远程预设 `static` 的 `platformCommands.win32` 为 `python -m http.server 8000`、`default` 为 `python3 -m http.server 8000`——Windows 用户选择该预设时表单填入 `python` 命令，macOS/Linux 用户填入 `python3` 命令；feed 未提供 `platformCommands` 时使用 `commandLine`。

### Requirement: 预设缓存与手动刷新

预设缓存带时间戳，TTL（默认 24 小时）内不重复拉取远程源；用户在添加弹窗可点击「刷新预设」立即重新拉取（绕过 TTL），成功后下拉列表更新、显示更新时间，失败时提示错误且现有列表保持不变；刷新不打断弹窗内已填写内容。

#### Scenario: TTL 内不重复拉取

用户启动 WebDeck 拉取 feed 后 24 小时内再次打开添加弹窗或重启应用，不产生新的网络请求，直接使用缓存。

#### Scenario: 手动刷新立即生效

用户在弹窗点击「刷新预设」，feed 中刚新增的预设立刻出现在下拉列表，无需重启 WebDeck。

#### Scenario: 刷新失败不影响现有列表

用户断网点击「刷新预设」，弹窗提示刷新失败，预设下拉仍显示当前（缓存或内置）列表，已填写表单内容不受影响。

### Requirement: 预设源可配置（高级）

远程源地址可覆盖：`settings.presetsFeedUrl`（webdeck.json 手写配置）非空时使用该地址作为 feed 源，为空或缺失时使用默认源（`https://raw.githubusercontent.com/holyshock31/webdeck/main/docs/presets.json`）；自定义源同样受 schema 校验与回退保护。

#### Scenario: 配置自定义源后生效

用户在 `webdeck.json` 的 `settings` 中写入 `presetsFeedUrl` 指向自己托管的 feed，重启 WebDeck 后弹窗预设来自该源。

#### Scenario: 未配置时使用默认源

`settings.presetsFeedUrl` 缺失或为空，预设拉取走默认 GitHub raw 源，行为与默认一致。
