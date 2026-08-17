# Tasks — add-update-check

- [x] package.json：新增 devDependency electron-updater；build 配置增加 `publish: { provider: github, owner: holyshock31, repo: webdeck }`
- [x] src/main/updater.js：主进程更新服务——调度（启动延迟 5s、周期 6h±15% 抖动、失败指数退避 5→60min）、`autoInstallOnAppQuit=false`、`allowDowngrade=false`、Windows `verifyUpdateCodeSignature=false`；portable（PORTABLE_EXECUTABLE_DIR）与开发版跳过自动检查
- [x] src/main/updater.js：事件广播（available/not_available/download_progress/downloaded/error）经 IPC 到渲染层；检查/下载/安装/打开下载页四类 IPC 处理器
- [x] src/main/index.js：注册 updater 服务（打包版启动时初始化）与 IPC
- [x] src/preload/preload.cjs + src/renderer/app.js：更新入口——检查按钮（debounce）、下载进度显示、更新弹窗（release notes + 稍后/立即安装/忽略）、手动检查与自动检查提示区分（manualCheck 语义）；macOS 与 portable 显示"打开下载页"而非安装按钮
- [x] .github/workflows/release.yml：softprops 上传产物补 `dist/latest*.yml`（electron-builder 生成的更新元数据）
- [x] scripts/test-core.js：调度退避纯函数、更新配置构造断言（不依赖网络）——测试 11（updater-policy 纯函数）
- [x] README.md 与 docs：更新机制说明（Windows 安装版自动更新、macOS/portable 手动下载）、真机验证清单（Windows 安装版全链路升级、macOS 提示跳转、检查入口）
