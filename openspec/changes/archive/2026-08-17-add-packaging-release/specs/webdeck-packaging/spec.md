# webdeck-packaging Specification

## ADDED Requirements

### Requirement: 跨平台安装包通过 GitHub Releases 分发

打版本 tag（`v*`）后，GitHub Actions 在 macos-latest / windows-latest / ubuntu-latest 三个 runner 上**各自原生构建**对应平台的安装包（macOS 出 dmg + zip，Windows 出 NSIS 安装包 + portable 便携版，Linux 出 AppImage），产物自动上传到对应 tag 的 GitHub Releases 页面；不交叉编译（Windows 产物只由 windows-latest runner 产出）。

#### Scenario: 打 tag 后三平台产物出现在 Releases

维护者在仓库打 tag `v0.2.0` 并推送，CI 完成后 GitHub Releases 的 v0.2.0 页面出现 macOS（dmg/zip）、Windows（NSIS/portable）、Linux（AppImage）共三套产物，用户可直接下载。

#### Scenario: Windows 产物由 Windows runner 产出

打 tag 触发 CI 后，Windows 的 NSIS 安装包与 portable 便携版由 windows-latest runner 构建产出，不在 macOS runner 上交叉编译，产物可原生安装验证。

#### Scenario: 安装包内容限定应用本体

用户下载安装包安装后，应用内包含 WebDeck 自身代码与资源（src、assets），不携带开发依赖与源码无关文件；安装包以 asar 归档应用内容。

### Requirement: macOS 安装包签名与公证

macOS 构建产物使用 Developer ID 证书签名并完成 Apple 公证（CI 配置 `CSC_LINK` / `CSC_KEY_PASSWORD` 与公证凭据时）；签名公证后的 dmg 首次打开不触发 Gatekeeper 拦截。未配置证书时构建可跳过签名（开发态/无凭据环境），产物可用但需右键打开或按 README 指引放行。

#### Scenario: 已签名公证的 dmg 可直接安装

用户从 Releases 下载 dmg，双击挂载并拖入应用程序，首次启动不被 Gatekeeper 拦截，直接进入 WebDeck 界面。

#### Scenario: 未签名构建可跳过签名

本机未配置 Apple 证书时运行 `npx electron-builder --dir` 构建成功，产物为未签名 WebDeck.app，README 记录跳过签名方式（`CSC_IDENTITY_AUTO_DISCOVERY=false`）与 Gatekeeper 放行指引。

### Requirement: Windows 安装包可安装启动且任务栏显示 WebDeck

Windows NSIS 安装包支持 per-user 安装并创建开始菜单/桌面快捷方式；portable 便携版解压即用；安装/运行后任务栏与通知归属显示 WebDeck 名称与图标（AppUserModelID 与打包 appId 一致）；未签名安装包首次运行出现 SmartScreen 提示时，README 提供「更多信息 → 仍要运行」绕过指引。

#### Scenario: NSIS 安装并启动

用户在 Windows 运行 NSIS 安装包完成安装，开始菜单出现 WebDeck 快捷方式；启动后任务栏按钮显示 WebDeck 名称与图标，添加应用与本地服务启动功能正常。

#### Scenario: portable 版解压即用

用户下载 portable 便携版解压，直接运行其中的 WebDeck.exe 即可使用，无需安装；任务栏显示 WebDeck。

#### Scenario: 未签名产物的 SmartScreen 提示有据可查

用户首次运行未签名的 WebDeck.exe，SmartScreen 弹出「Windows 已保护你的电脑」，按 README 中「更多信息 → 仍要运行」指引可继续安装/运行。

### Requirement: Linux AppImage 可直接运行

Linux 构建产物为 AppImage 格式，用户下载后赋予可执行权限即可运行，侧边栏、添加应用、本地服务拉起与健康监测功能与开发态一致。

#### Scenario: 运行 AppImage

用户在 Linux 下载 WebDeck.AppImage，执行 `chmod +x WebDeck.AppImage` 后运行，WebDeck 正常启动，添加本地服务应用并拉起服务后状态灯变绿。

### Requirement: 发布流程与平台差异有文档指引

README 提供完整发布流程（打 tag → CI 构建 → Releases 下载）、Windows 使用说明（Shell 命令 `%USERPROFILE%` / `cd /d` 写法、中文日志 `chcp 65001` 提示）与常见问题（SmartScreen、Gatekeeper、未签名产物说明）；Windows 签名决策（先不签或 Azure Trusted Signing）在文档中明确记录。

#### Scenario: 按 README 完成一次发布

维护者按 README 发布流程打 tag 并推送，CI 完成后在 Releases 页面拿到三平台安装包，全程无需口头/线下沟通额外步骤。

#### Scenario: Windows 用户在文档中找到 Shell 命令写法

Windows 用户配置 Shell 命令时按 README 示例（`cd /d %USERPROFILE%\dsh && pnpm dsh`）填写，本地服务正常拉起；输出中文日志的应用在日志面板显示不乱码（按提示使用 `chcp 65001`）。
