# Tasks — add-ui-hot-update

- [ ] src/main/ui-updater.js：新增 `parseUiManifest(json)`——schema 校验（version/minAppVersion/ref 为字符串、files 数组；path 仅允许 src/renderer/** 相对路径、禁止 `..` 与绝对路径；sha256 为 64 位 hex、size 为正整数）
- [ ] src/main/ui-updater.js：新增 `createUiUpdater(...)`——checkForUpdate(manifestUrl)：TTL（默认 24h）内跳过 → fetch manifest → parseUiManifest → minAppVersion 门槛（当前 app 版本低于则跳过）→ 与 appliedVersion 比较 → 逐文件从 `<feedUrl 基址>/<ref>/<path>` fetch + sha256 校验（10s 超时、单文件 1MB 上限）→ 全部成功写入 `userData/ui/<version>/` 并返回新版本；任一步失败丢弃新目录、保留旧版本静默
- [ ] src/main/ui-updater.js：新增 `resolveUiRoot(...)`——当前 app 版本 == appliedAppVersion 且 `userData/ui/<uiVersion>/` 存在 → 返回该目录；否则返回内置 bundledRoot（整包升级后自动回内置）
- [ ] src/main/index.js：壳 UI 与覆盖视图 loadFile 改经 resolveUiRoot() 解析（index.html、expand-button.html、find-bar.html 三处），preload 路径不变（asar）
- [ ] src/main/index.js：打包版启动时异步 checkForUpdate（settings.uiFeedUrl 覆盖默认源 `https://raw.githubusercontent.com/holyshock31/webdeck/main/docs/ui/latest.json`）→ 有新版本 → 写 settings.uiVersion/appliedAppVersion → 重载壳 UI 与覆盖视图
- [ ] src/main/index.js：`ui:ready` 握手——渲染层初始化后发送，主进程 15s 超时未收到、或 render-process-gone、或 did-fail-load → 回滚上一版本（保留目录最多 2 个）并重载
- [ ] src/main/index.js：帮助菜单新增「检查界面更新…」→ IPC `ui:check`（手动触发：已最新 / 更新成功 / 失败原因，明确反馈）
- [ ] src/preload/preload.cjs：新增 `uiReady()` / `checkUiUpdate()` 白名单桥
- [ ] src/renderer/app.js：init() 末尾发送 uiReady()
- [ ] scripts/build-ui-manifest.js：新增——遍历 src/renderer/**（含 icons/），计算 sha256/size，以当前 git SHA 为 ref，version 由参数/环境变量传入（格式 `YYYY.MM.DD.N`），生成 docs/ui/latest.json
- [ ] docs/ui/latest.json：初始生成 manifest（当前 renderer 文件清单，version 如 2026.08.17.1）
- [ ] .github/workflows/ui-manifest.yml：新增——push main 且 paths 含 src/renderer/**、src/preload/**、scripts/build-ui-manifest.js → 构建并提交 docs/ui/latest.json；release.yml 打 tag 时同步生成
- [ ] package.json：scripts 新增 `ui:manifest`
- [ ] scripts/test-core.js：新增 ui-updater 单测组（manifest 校验拒绝非法/路径穿越、sha256 不符丢弃、部分文件失败保留旧版、minAppVersion 门槛、TTL 跳过、resolveUiRoot 整包升级回内置语义）
- [ ] README.md：热更新机制章节（更新对象与触发时机、回退、本地验证方法 settings.uiFeedUrl、安全模型与已知风险）；真机验证清单（打包版 + 本地 http feed：修改 renderer 文件 → 生成 manifest → 启动应用 → 新 UI 生效且进程/标签无感；投放损坏文件 → 回滚旧 UI；手动「检查界面更新」反馈）
