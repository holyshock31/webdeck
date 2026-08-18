# Proposal — add-preset-feed

## Why

WebDeck 的「添加应用」预设（DeepSeek Harness、本地静态服务）目前硬编码在 `src/renderer/app.js` 的 `PRESETS` 常量（L209-222，含平台分支的静态服务命令），弹窗下拉 `#f-preset`（`src/renderer/index.html` L54）直接引用。这意味着：**任何预设的增改（新增一个常用工具、修正某平台命令）都必须发一个新版本整包**——与「整包更新比较大」的痛点直接相关，但预设本质上只是表单字段数据，属于天然可以热更新的「内容型」部分。

本变更把预设拆为两层：**内置兜底（编译进代码，保证零网络可用）+ 远程 feed（版本化 JSON，可随时更新）**。远程 feed 更新后用户无需升级 WebDeck 即可在添加弹窗看到新预设。这是「内容与代码分离、局部热更新」的第一步，为后续主题包、feature flag 等内容型更新建立同一套模式（fetch → 校验 → 缓存 → 回退 → 合并）。

设计约束（决定实现形态）：

- **主进程持有预设数据**：渲染层零硬编码、单一数据源。主进程启动时异步拉取 feed（不阻塞启动），校验通过后原子写入 `userData/presets.json` 缓存，失败静默保留旧缓存；`presets:list` 从内存同步返回（弹窗打开零等待），`presets:refresh` 手动强制刷新（用户无需重启即可看到新预设——「热更新」的直接体现）
- **平台差异在合并时解决**：feed 条目支持 `launch.platformCommands: { win32, darwin, linux, default }`，主进程按当前平台选命令后下发——渲染层不再需要 `STATIC_SERVER_CMD` 平台分支（现状 L203-207），feed 作者也可为各平台提供不同命令
- **安全**：feed 只提供表单字段值、不执行代码；URL 协议白名单（http/https）；schema 严格校验（字段类型、`launch.mode` 与命令组合规则与 `apps.js` 的 `normalizeApp` 一致），非法条目丢弃、非法整体拒绝并保留旧缓存
- **默认源零服务器**：默认 feed URL 指向仓库内 `docs/presets.json` 的 GitHub raw 直连（与自动更新走 GitHub Releases 的哲学一致）；`settings.presetsFeedUrl` 可覆盖（高级设置，webdeck.json 手动配置，本轮不做设置 UI——设置面板尚未存在）

## What Changes

- 新增 `src/main/presets.js`（纯 Node 可单测，不依赖 Electron）：
  - `BUNDLED_PRESETS`：内置兜底预设（从 renderer 的 `PRESETS` 迁移，单一数据源）
  - `validateFeed(json)`：feed schema 校验（`version` 字符串 + `presets` 数组；每条校验 id/name/url 必填、url 协议白名单、`launch.mode` ∈ none/direct/shell 且组合校验、monitor 可选字段类型；未知字段丢弃）
  - `mergePresets(bundled, remote)`：按 id 合并，远程覆盖同 id、追加新 id
  - `createPresetStore({ bundled, feedUrl, cacheFile, fetchFn, ttlMs, now })`：`list()`（合并结果 + 来源/更新时间）、`refresh()`（TTL 内跳过 → fetch（10s 超时、256KB 上限）→ validate → 原子写缓存（临时文件 + rename，与 store.js 同机制）→ 失败静默保留旧缓存）、`lastUpdated()`；平台命令选择（精确平台 → `default` → `commandLine`）
- `src/main/index.js`：启动时初始化 preset store（feedUrl 默认常量 + `settings.presetsFeedUrl` 覆盖；cacheFile = `userData/presets.json`），异步 `refresh()` 不阻塞启动；注册 IPC `presets:list`（返回 `{ presets, source, updatedAt }`）与 `presets:refresh`（立即刷新，返回结果或错误）
- `src/preload/preload.cjs`：白名单桥新增 `listPresets()` / `refreshPresets()`
- `src/renderer/app.js`：删除 `PRESETS` 常量与 `STATIC_SERVER_CMD` 平台分支；`#f-preset` 选项改为 `webdeck.listPresets()` 填充；change 填表逻辑不变（命令已是本平台值）；新增「刷新预设」动作（调 `refreshPresets()`，成功重新填充、失败提示且保留现有列表）
- `src/renderer/index.html`：预设选择区旁新增「刷新预设」小按钮
- 仓库新增 `docs/presets.json`：默认远程源内容（初始与内置兜底一致，此后新增预设只需改此文件、无需发版）
- `scripts/test-core.js`：新增 preset 单测组（校验拒绝非法 feed/条目、合并远程优先、TTL 跳过刷新、fetch 失败保留旧缓存、平台命令选择、原子写）
- README：预设章节更新（远程源机制、回退、TTL、`settings.presetsFeedUrl` 自定义源、更新预设 = 更新 feed 文件）

## Impact

- **运行时行为**：启动时多一次后台 fetch（失败静默，不影响启动速度与现有功能）；添加弹窗预设下拉由同步常量变为 IPC 返回（主进程内存态，打开弹窗零等待）；其余（进程管理、监测、更新）不受影响
- **依赖**：零新增（Node 18+/Electron 37 内置全局 `fetch`）
- **兼容性**：跨平台一致（平台差异在合并层解决）；开发态/打包态行为一致；`webdeck.json` 无 schema 破坏（`settings.presetsFeedUrl` 为可选新增字段）
- **风险与已知限制**：raw.githubusercontent 直连在国内可能不稳——已有「缓存 + 内置兜底」双回退，最坏情况等价于现状（只有内置预设）；feed 内容更新生效时机为「下次启动刷新」或「手动点刷新」，不做推送
- **范围边界**：不做主题包热更新 / feature flag / 壳 UI 热更新（后续变更，复用本变更建立的 fetch→校验→缓存→回退模式）；不做 feed 多版本管理与回滚（TTL 内不重拉、成功即覆盖）；不做设置 UI（feed URL 仅 webdeck.json 手动配置）；验收方式为 `npm test` + `npm run smoke` + 真机清单（macOS 手测断网/连网两种启动、刷新按钮、自定义 feed URL）

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
