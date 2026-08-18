# Tasks — add-preset-feed

- [ ] src/main/presets.js：新增 `BUNDLED_PRESETS`（从 renderer PRESETS 迁移，静态服务命令改为 platformCommands 形态）
- [ ] src/main/presets.js：新增 `validateFeed(json)`——version 字符串 + presets 数组；每条校验 id/name/url 必填、url 协议白名单（http/https）、launch.mode ∈ none/direct/shell 且组合校验（direct 必填 command、shell 必填 commandLine）、monitor 可选字段类型；未知字段丢弃
- [ ] src/main/presets.js：新增 `mergePresets(bundled, remote)`——按 id 合并，远程覆盖同 id、追加新 id
- [ ] src/main/presets.js：新增 `createPresetStore(...)`——list() 返回合并结果与来源/更新时间；refresh() 按 TTL（默认 24h）跳过 → fetch（10s 超时、256KB 上限）→ validate → 原子写缓存（临时文件 + rename）→ 失败静默保留旧缓存；平台命令选择（精确平台 → default → commandLine）
- [ ] src/main/index.js：启动时初始化 preset store（feedUrl = 默认常量 `https://raw.githubusercontent.com/holyshock31/webdeck/main/docs/presets.json`，`settings.presetsFeedUrl` 非空时覆盖；cacheFile = userData/presets.json），异步 refresh 不阻塞启动
- [ ] src/main/index.js：注册 IPC `presets:list`（返回 { presets, source, updatedAt }）与 `presets:refresh`（立即刷新，返回结果或错误）
- [ ] src/preload/preload.cjs：新增 `listPresets()` / `refreshPresets()` 白名单桥
- [ ] src/renderer/app.js：删除 PRESETS 常量与 STATIC_SERVER_CMD 平台分支；#f-preset 选项改为 webdeck.listPresets() 填充；change 填表逻辑保持；新增刷新预设逻辑（成功重新填充、失败提示且保留现有列表）
- [ ] src/renderer/index.html：预设选择区旁新增「刷新预设」小按钮
- [ ] docs/presets.json：新增默认 feed 内容（初始与内置兜底一致：DeepSeek Harness + 本地静态服务，静态服务含 platformCommands）
- [ ] scripts/test-core.js：新增 preset 单测组（validateFeed 非法整体拒绝/非法条目丢弃、mergePresets 远程优先、TTL 跳过刷新、fetch 失败保留旧缓存、平台命令选择、原子写）
- [ ] README.md：预设章节更新（远程源机制、回退、TTL、settings.presetsFeedUrl 自定义源、更新预设 = 更新 feed 文件）；真机验证清单（macOS 手测：断网首次启动弹窗仍有内置预设；连网后启动新预设出现；刷新按钮立即生效；自定义 feed URL 生效）
