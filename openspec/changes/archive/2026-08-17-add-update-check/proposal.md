# Proposal — add-update-check

## Why

WebDeck 目前没有更新机制：用户只能手动访问 GitHub Releases 下载新版。参考开源项目 Cherry Studio（electron-updater 6.7.0 + GitHub Releases 直连，调研报告见 .tmp-cherry-research/REPORT.md）的成熟方案，为 WebDeck 增加更新检查与安装能力。关键约束（调研结论 + 项目现状）：

- **Windows 安装版**：electron-updater 官方完整支持（`verifyUpdateCodeSignature: false` 可兼容未签名产物）——自动更新可用，SmartScreen 提示是已知代价
- **macOS 未签名**：自动更新**不可用**（Squirrel.Mac 要求签名，替换后的 app 过不了 Gatekeeper）——退化为"检测到新版 → 提示 + 打开下载页"
- **portable 版**：electron-updater 不支持（Cherry 也是 `isPortable()` 直接跳过）——不做自动检查
- **无自建服务器**：直接 `publish: { provider: github }` 从 GitHub Releases 读 `latest*.yml`（electron-builder 构建时自动生成），无需 Cherry 那套 Cloudflare/R2 镜像
- **防御性设计**（Cherry 踩坑总结）：`autoInstallOnAppQuit = false`（必须用户点"立即安装"）、自动检查静默不打扰（`manualCheck` 区分）、失败指数退避、调度加随机抖动

## What Changes

- 新增 devDependency `electron-updater`；`package.json` build 配置增加 `publish: { provider: github, owner, repo }`（GitHub Releases 直连）
- 新增 `src/main/updater.js`：主进程更新服务（精简版 AppUpdaterService）——
  - 调度：打包版启动延迟 5s 首查 → 每 6h ±15% 随机抖动 → 失败指数退避（5→60min 封顶）；开发版/portable 跳过自动检查
  - 配置：`autoInstallOnAppQuit = false`、`allowDowngrade = false`、`verifyUpdateCodeSignature: false`（Windows 未签名兼容）
  - 事件经 IPC 广播：`available` / `not_available` / `download_progress` / `downloaded` / `error`
  - **平台分派**：Windows 安装版走完整自动下载+安装（`quitAndInstall(true, true)` 经 IPC 触发）；macOS（未签名）与任何检测到新版本的场景提供"打开 Releases 下载页"退化路径；portable 不做检查
- `src/preload/preload.cjs` + `src/renderer/app.js`：设置/关于区域更新入口——检查按钮（2s debounce）、下载进度、更新弹窗（release notes + 稍后 / 立即安装 / 忽略）、手动检查与自动检查的提示区分（manualCheck 语义）
- `.github/workflows/release.yml`：上传产物列表补 `dist/latest*.yml`（electron-builder 自动生成的更新元数据），否则客户端无法检查
- 测试：调度退避/抖动、配置构造（纯函数可单测，不依赖网络）；文档与真机清单

## Impact

- **运行时行为**：新增更新检查服务（主进程常驻调度，失败静默）；不影响现有启动/进程/监测逻辑；Windows 安装版新增"立即安装"交互
- **网络**：每 6h 一次轻量请求（latest.yml + 元数据），失败退避；不更新不下载安装包
- **依赖**：新增 electron-updater（electron-builder 同族，体积可控）
- **兼容性**：无持久化 schema 变更（更新状态可内存态，无需持久化）；IPC 新增通道；打包配置新增 publish 段
- **风险与已知限制**：Windows 未签名自动更新可用但 SmartScreen 提示；macOS 仅提示跳下载页（自动更新需签名，另立变更）；portable 无更新检查（文档说明）；差分更新（blockmap）默认启用（GitHub 直连省流量），如遇问题可关闭
- **范围边界**：不做多通道（latest/rc/beta）、不做区域分流、不做 release-history 页、不做自建 CDN；验收方式为手动验证（Windows 安装版升级链路 + macOS 提示 + 检查入口）

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
