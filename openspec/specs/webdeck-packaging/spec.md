# webdeck-packaging Specification

## Requirements
## Requirements

### Requirement: 跨平台安装包通过 GitHub Releases 分发

打版本 tag（`v*`）后，GitHub Actions 在 macos-latest / windows-latest / ubuntu-latest 三个 runner 上**各自原生构建**对应平台的安装包（macOS 出 dmg + zip，Windows 出 NSIS 安装包 + portable 便携版，Linux 出 AppImage），产物自动上传到对应 tag 的 GitHub Releases 页面；不交叉编译（Windows 产物只由 windows-latest runner 产出）。

#### Scenario: 打 tag 后三平台产物出现在 Releases

维护者在仓库打 tag `v0.2.0` 并推送，CI 完成后 GitHub Releases 的 v0.2.0 页面出现 macOS（dmg/zip）、Windows（NSIS/portable）、Linux（AppImage）共三套产物，用户可直接下载。

#### Scenario: Windows 产物由 Windows runner 产出

打 tag 触发 CI 后，Windows 的 NSIS 安装包与 portable 便携版由 windows-latest runner 构建产出，不在 macOS runner 上交叉编译，产物可原生安装验证。

#### Scenario: 安装包内容限定应用本体

用户下载安装包安装后，应用内包含 WebDeck 自身代码与资源（src、assets），不携带开发依赖与源码无关文件；安装包以 asar 归档应用内容。

### Requirement: macOS 安装包签名与公证

macOS 构建产物使用 Developer ID 证书签名并完成 Apple 公证（CI 配置 `CSC_LINK` / `CSC_KEY_PASSWORD` 与公证凭据时）；签名公证后的 dmg 首次打开不触发 Gatekeeper 拦截。未配置证书时构建可跳过正式签名（开发态/无凭据环境），但**必须对 .app 做完整 ad-hoc 签名**（`codesign --force --deep --sign -`，密封资源）后再产出安装包与更新 zip——产物可用（首次安装需右键打开或按 README 指引放行），且更新 zip 内 app 通过 `codesign --verify --deep --strict` 校验、可被 Squirrel.Mac 接受完成自动安装；产物命名保持既有 `-unsigned` 后缀约定（仅标识"未用 Developer ID 签名"，不影响可安装性）。

#### Scenario: 已签名公证的 dmg 可直接安装

用户从 Releases 下载 dmg，双击挂载并拖入应用程序，首次启动不被 Gatekeeper 拦截，直接进入 WebDeck 界面。

#### Scenario: 未配置证书构建成功且签名可校验

本机未配置 Apple 证书时运行发布流水线 unsigned 分支构建成功，产物为 ad-hoc 签名的 WebDeck.app；其更新 zip 内 app 执行 `codesign --verify --deep --strict` 通过（`Sealed Resources` 完整），README 记录无证书构建方式（`CSC_IDENTITY_AUTO_DISCOVERY=false`）与 Gatekeeper 放行指引。

#### Scenario: unsigned 更新包可完成自动安装

维护者在无 Apple 证书的 CI 环境发布 mac 版本（`-unsigned` 后缀 zip），客户端检测到新版并下载后，用户点击"立即安装"——Squirrel.Mac 签名校验通过，安装完成并自动重启进入新版本，无需手动下载安装包。

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

### Requirement: 发布物包含更新元数据

GitHub Releases 发布物除安装包外包含 electron-builder 生成的更新元数据文件（`latest*.yml`），客户端据此检查版本、校验文件完整性（sha512）并定位下载地址；元数据随每次 tag 构建自动生成并上传。

#### Scenario: 打 tag 后 Releases 含更新元数据

维护者打 tag 触发发布流水线，GitHub Releases 页面出现 `latest.yml`（Windows）与 `latest-mac.yml` / `latest-linux.yml` 等元数据文件，安装版客户端可据此检查到新版本。

#### Scenario: 无更新元数据时客户端不误报

若某次发布缺少元数据文件（如手工上传产物），客户端更新检查不报错误导用户，按无更新或检查失败处理，不影响应用使用。

### Requirement: 打包产物包含运行时依赖

安装包内的应用代码可正常加载**运行时依赖**：所有被 `src/**` 代码 import 的外部包（如 electron-updater）随 asar 打包（置于 `package.json` 的 `dependencies`，electron-builder 自动包含其传递依赖）；仅构建期使用的工具（electron、electron-builder）留在 devDependencies 不进包。打包产物启动时不得出现 `ERR_MODULE_NOT_FOUND` 类缺包崩溃。

#### Scenario: 安装版启动不因缺包崩溃

用户安装新版 WebDeck（如 v0.1.9）并启动，应用正常进入主界面，更新服务初始化成功——不出现 `Cannot find package 'electron-updater'` 崩溃。

#### Scenario: 更新检查入口可用

用户在安装版菜单点击「帮助 → 检查更新…」，更新服务正常发起检查（成功或返回可理解的失败提示），不因缺包直接崩溃。

### Requirement: 发布产物经人工确认后才对外可见

打 tag 触发的发布流水线把三平台资产上传到 **draft（草稿）release**，不自动发布、不自动标记 Latest；维护者在 GitHub Releases 页面确认资产齐全后手动 **Publish release**，此后客户端（electron-updater）才能检测到该版本并下载。任一平台构建失败时，release 保持草稿状态、客户端不可见。

#### Scenario: 平台构建失败时客户端不受影响

某版本 Windows 构建失败，macOS/Linux 资产已上传——release 保持 draft 状态，已安装旧版客户端检查更新不检测到该版本，不出现下载 404。

#### Scenario: 人工发布后客户端可检测

维护者确认三平台资产齐全后手动 Publish release，客户端检查更新检测到新版本并正常下载安装。

### Requirement: 更新元数据与实际资产一致

GitHub Releases 上的更新元数据（`latest*.yml`）中每个文件 url 必须与同 release 的实际资产文件名**完全一致**（含未签名 `-unsigned` 后缀等命名规则）——命名差异（构建后重命名、artifactName 漂移）必须在构建时消除，客户端按元数据下载不得出现 404。unsigned 分支改为"先签名后打包"流程后，构建时生成的元数据与实际资产名仍须保持一致（构建后禁止重命名产物）。

#### Scenario: 客户端按元数据下载成功

用户安装版检查到新版本后，按 `latest*.yml` 的 url 下载更新包成功（文件存在、sha512 校验通过），不出现 `status 404` 下载失败。

#### Scenario: 未签名产物命名一致

未签名构建的 mac 产物（`-unsigned` 后缀）在 `latest-mac.yml` 中 url 与实际资产名一致（如 `WebDeck-0.1.10-arm64-mac-unsigned.zip`），客户端可下载；改为"先 ad-hoc 签名再打包"后该命名约定保持不变。
