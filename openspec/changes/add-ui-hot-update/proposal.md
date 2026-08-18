# Proposal — add-ui-hot-update

## Why

WebDeck 的壳 UI（`src/renderer/` 下 index.html / styles.css / app.js / expand-button.html / find-bar.html / icons/）与主进程代码一起打包进 asar（`win.loadFile('../renderer/index.html')`，index.js L737；覆盖视图同目录 L191/L275）。这意味着**任何界面改动都必须发布新版本整包下载**——正是「整包更新比较大」痛点的最大来源：界面代码占了 WebDeck 改动的大头，且本质是纯静态内容（无 Node 能力，只经 preload 白名单 API 与主进程通信），完全可以独立版本化、热更新。

本变更把壳 UI 从"随包内容"变为"独立版本化的可热更新内容"：

- **UI 更新与整包发布解耦**：改动界面 = 只更新 UI 内容（几十 KB 逐文件拉取），用户无需下载安装包
- **真正的热生效**：新 UI 拉取校验通过后自动重载壳（应用进程、本地服务、标签页全部无感），无需重启应用
- **机制复用**：与 `add-preset-feed` 同一套模式（fetch → 校验 → 缓存 → 回退），但更新对象从"预设数据"升级为"界面代码"

关键设计决策（决定实现形态）：

- **清单式多文件传输，零新依赖**：manifest（`docs/ui/latest.json`）列出每个 UI 文件的 `path` + `sha256` + `size`，客户端逐文件从 `raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>` 拉取并校验（`ref` 为生成时的 git commit SHA，保证文件不可变）。不做 zip——不需要解压库、无路径穿越风险、无需构建链（项目"无构建链"约定不受破坏）
- **preload 永不进入热更新包**：`src/preload/*.cjs` 是安全边界（白名单 API 桥），永远留在 asar——即使 UI 源被攻破，攻击面也不超过内置 UI 本身
- **版本与兼容分离**：manifest.version 为单调递增的 UI 版本（日期+序号）；`minAppVersion` 为应用版本门槛——UI 若用了新 IPC，发布者提高 `minAppVersion`，旧版应用自动跳过该 UI（不破坏运行）；应用整包升级后重置为内置 UI 再重新热更新（内置 UI 的 API 一定与当前主进程匹配）
- **回退保护**：新 UI 应用后渲染层须在超时内发送 `ui:ready` 握手，超时/崩溃（`render-process-gone`/`did-fail-load`）自动回滚上一版本并重载；保留最近 2 个版本目录
- **打包版专属**：开发态（`!app.isPackaged`）完全禁用 UI 热更新（永远用 `src/renderer/` 内置），smoke 测试与日常开发不受影响；`settings.uiFeedUrl` 可覆盖源（http 仅允许回环地址，用于本地验证）
- **发布侧零服务器**：CI 在 main 分支 renderer/preload 变更时自动生成并提交 `docs/ui/latest.json`，客户端经 GitHub raw 直连——与预设 feed、自动更新同哲学

## What Changes

- 新增 `src/main/ui-updater.js`（纯 Node 可单测，不依赖 Electron）：
  - `parseUiManifest(json)`：schema 校验（version/minAppVersion/ref 字符串、files 数组；path 仅允许 `src/renderer/**` 相对路径、禁止 `..` 与绝对路径；sha256 格式、size 正整数）
  - `createUiUpdater({ uiDir, fetchFn, ttlMs, now })`：`checkForUpdate(manifestUrl)`（TTL 内跳过 → fetch manifest → 校验 → minAppVersion 门槛（对比 app 版本）→ version 对比 → 逐文件 fetch + sha256 校验 → 全部成功写 `userData/ui/<version>/` 并返回新版本；任一步失败丢弃新目录、保留旧版本静默）/ `appliedVersion()` / `resolveUiRoot({ bundledRoot, appliedVersion, appliedAppVersion, currentAppVersion })`（应用版本未变化且已应用目录存在 → userData/ui/<version>，否则内置 bundledRoot——整包升级后自动回内置）
- `src/main/index.js`：
  - 壳 UI 与两个覆盖视图的 loadFile 统一改经 `resolveUiRoot()` 解析（index.html、expand-button.html、find-bar.html）；preload 仍从 asar 加载（`../preload/*.cjs` 不变）
  - 启动（仅打包版）：异步 `checkForUpdate()` → 有新版本 → 应用（settings.uiVersion / appliedAppVersion 指针）→ 重载壳 UI 与覆盖视图（应用进程/标签页/本地服务无感）
  - `ui:ready` 握手：渲染层初始化完成后发送，主进程 15s 超时未收到（或 render-process-gone / did-fail-load）→ 回滚上一版本并重载
  - 帮助菜单新增「检查界面更新…」→ IPC `ui:check`（手动触发，明确反馈：已最新 / 更新成功 / 失败原因）
  - settings 读写：`uiVersion` / `appliedAppVersion` / `uiFeedUrl`（可选覆盖）
- `src/preload/preload.cjs`：白名单桥新增 `uiReady()` / `checkUiUpdate()`
- `src/renderer/app.js`：`init()` 末尾发送 `uiReady()`（唯一渲染层改动）
- 新增 `scripts/build-ui-manifest.js`（CI 侧，纯 Node）：遍历 `src/renderer/**` 计算 sha256/size，以当前 git SHA 为 ref，version 由参数/环境变量传入，生成 `docs/ui/latest.json`
- 新增 `docs/ui/latest.json`：初始生成的 manifest（含当前 renderer 文件清单）
- `.github/workflows/ui-manifest.yml`（新增）：push 到 main 且路径含 `src/renderer/**`、`src/preload/**`、`scripts/build-ui-manifest.js` 时构建并提交 `docs/ui/latest.json`；`release.yml` 在打 tag 时同步生成（保证整包发布的 UI 与热更新源一致）
- `package.json`：scripts 新增 `ui:manifest`（本地手动生成，用于验证）
- `scripts/test-core.js`：新增 ui-updater 单测组（manifest 校验拒绝非法/路径穿越、sha256 不符丢弃、部分文件失败保留旧版、minAppVersion 门槛、TTL 跳过、resolveUiRoot 的整包升级回内置语义）
- README：热更新机制章节（更新对象与触发时机、回退、本地验证方法、安全模型与已知风险）

## Impact

- **运行时行为**：打包版启动多一次后台 manifest 检查（TTL 24h，失败静默）；壳 UI 加载路径从固定 asar 变为「已应用版本目录 → 内置」两级解析；其余（进程管理、监测、更新）不受影响。热更新应用时壳 UI 重载一次（≤1s，无数据丢失——状态都在主进程）
- **依赖**：零新增（Node 内置 fetch + crypto）
- **兼容性**：开发态/smoke 完全不变（热更新仅打包版启用）；`webdeck.json` 无 schema 破坏（settings 新增可选字段）；旧版应用拉取到高 minAppVersion 的 manifest 时安全跳过
- **风险与已知限制**：raw.githubusercontent 直连不稳时 UI 热更新失败静默回退（等价现状，内置 UI 始终可用）；信任模型——manifest 源若被攻破可下发恶意 UI（权限等价内置 UI，可经 apps:add 执行用户配置的 shell 命令），与自动更新未签名同类风险，README 明示；UI 更新生效时机为「下次启动检查」或「手动检查界面更新」，不做推送
- **范围边界**：不做主进程代码热更新（只能整包，这是本设计的边界）；不做 UI 包 zip 化（清单式多文件已够小）；不做多 feed/灰度通道；验收方式为 `npm test` + `npm run smoke` + 真机清单（打包版本地 feed 验证热更新全链路与回滚）

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
