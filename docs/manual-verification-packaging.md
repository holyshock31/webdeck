# 打包产物手动验收清单（add-packaging-release）

> 对应 `openspec/changes/add-packaging-release` 的手动验收方式（webdeck-packaging 规格：
> 「跨平台安装包通过 GitHub Releases 分发」「macOS 安装包签名与公证」「Windows 安装包可安装启动且任务栏显示 WebDeck」「Linux AppImage 可直接运行」等场景）。
> 前置：仓库已推送、打 tag 触发 release.yml 完成，或本地 `npm run dist:mac` 产出 dmg。
> 签名相关步骤区分「已配置 secrets（签名+公证）」与「未配置（-unsigned 产物）」两种形态。

## 通用前置

- [ ] `npm test` 全部通过
- [ ] release.yml 的 tag 构建三平台 job 全部成功，GitHub Releases 页面出现三套产物
- [ ] 产物命名符合预期：macOS `WebDeck-<ver>.dmg` / `.zip`（未签名时为 `-unsigned` 后缀）；Windows `WebDeck Setup <ver>.exe`（NSIS）与 `WebDeck <ver>.exe`（portable）；Linux `WebDeck-<ver>.AppImage`

## macOS

- [ ] 双击 dmg 挂载 → 拖入「应用程序」→ 启动
- [ ] Dock 悬停提示与 ⌘Tab 切换器显示 **WebDeck**（而非 Electron），菜单栏应用菜单标题为 WebDeck
- [ ] 图标为 `assets/icon.icns` 对应图标（非默认 Electron 图标）
- [ ] 添加本地服务应用（如静态服务预设）→ 健康监测状态由黄转绿，功能与开发态一致
- [ ] 已签名+公证形态：首次打开**不触发** Gatekeeper 拦截
- [ ] 未签名形态（`-unsigned` 产物）：首次打开报「is damaged and can't be opened」——按 README 常见问题执行 `xattr -dr com.apple.quarantine /Applications/WebDeck.app` 后正常打开（Gatekeeper 对无签名应用不提供「仍要打开」选项）

## Windows

- [ ] 运行 NSIS 安装包：非一键安装（可选手动），默认 per-user 安装；开始菜单出现 WebDeck 快捷方式，桌面快捷方式可选
- [ ] 启动后任务栏按钮 hover 与通知归属显示 **WebDeck** 名称与图标（AppUserModelID `com.webdeck.app`）
- [ ] 卸载入口正常（设置 → 应用 或 卸载快捷方式）
- [ ] portable 便携版：解压后直接运行 WebDeck.exe 即可使用，无安装步骤；任务栏显示 WebDeck
- [ ] 未签名形态：首次运行出现 SmartScreen「Windows 已保护你的电脑」，按 README「更多信息 → 仍要运行」可继续
- [ ] 添加本地服务应用并启动：不弹控制台窗口、停止后任务管理器无进程树残留（复用 docs/windows-manual-verification.md 的运行时清单）

## Linux

- [ ] 下载 AppImage → `chmod +x WebDeck-<ver>.AppImage` → 直接运行（如缺 FUSE 依赖按发行版安装 fuse / libfuse2）
- [ ] 启动后窗口正常，添加本地服务应用 → 健康监测状态流转正常

## 回归

- [ ] 安装包内应用功能与开发态一致：主题切换、侧边栏收起、手动启停、日志面板均正常
- [ ] 三平台产物安装后 `userData/webdeck.json` 可正常读写（添加应用 → 重启 → 应用仍在）

## 记录

执行完成后把结果（通过/失败项）写回本清单或提交到 `openspec/changes/add-packaging-release/verify.md`（由 `/spec verify` 生成）。
