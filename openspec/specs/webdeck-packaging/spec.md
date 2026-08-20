# webdeck-packaging Specification

## Purpose

WebDeck 打包与发布能力的规格：跨平台安装包与更新产物、macOS 签名（Developer ID / 证书签名 / ad-hoc 兜底）、更新元数据一致性、发布门禁与文档指引。

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

macOS 构建产物按 CI 凭据配置分三种互斥模式产出，产物命名统一遵循 `-unsigned` 后缀约定（语义="未用 Developer ID 签名"，含 ad-hoc 与自签名两类，不影响可安装性与自动更新）：

1. **Developer ID 签名 + 公证**（配置 `CSC_LINK`/`CSC_KEY_PASSWORD` 且 Apple 公证凭据齐全时）：签名公证后的 dmg 首次打开不触发 Gatekeeper 拦截；产物无 `-unsigned` 后缀。
2. **证书签名、不公证**（配置 `CSC_LINK`/`CSC_KEY_PASSWORD`、无 Apple 公证凭据时）：使用 `CSC_LINK` 证书（可为自签名证书）对 .app 完整签名（密封资源）后出包，产物带 `-unsigned` 后缀；更新 zip 内 app MUST 通过 `codesign --verify --deep --strict`，且其指定需求（`codesign -d --requirements -`）MUST 为证书锚定形式（`identifier "com.webdeck.app" and certificate root = H"..."`，同一证书签出的新版本指定需求不变）——Squirrel.Mac 据此跨版本校验通过，自动安装可用，不依赖本机证书信任库、不联网。
3. **ad-hoc 签名兜底**（无 `CSC_LINK` 时）：与现状一致——对 .app 做完整 ad-hoc 签名（`codesign --force --deep --sign -`，密封资源）后出包，产物带 `-unsigned` 后缀；ad-hoc 指定需求为 `cdhash H"..."`（绑定单构建二进制），**跨版本自动更新不可用**，仅保证产物可安装。

已安装 ad-hoc 旧版的机器（其 Squirrel.Mac 仍以旧版 cdhash 指定需求校验）无法自动升级到证书签名版本：**首个证书签名版本（模式 1 或 2 产物）必须手动下载 dmg 安装**（右键打开放行），安装后该机器后续版本自动更新恢复正常。此过渡要求 MUST 记录于发布说明与 README。

#### Scenario: 已签名公证的 dmg 可直接安装

用户从 Releases 下载 dmg，双击挂载并拖入应用程序，首次启动不被 Gatekeeper 拦截，直接进入 WebDeck 界面。

#### Scenario: 自签名产物自动更新可用

维护者在无 Apple 付费证书的 CI 环境配置自签名证书（`CSC_LINK`），发布 mac 版本（`-unsigned` 后缀 zip）。已安装证书签名旧版的客户端检测到新版并下载后，用户点击"立即安装"——Squirrel.Mac 签名校验通过，安装完成并自动重启进入新版本，无需手动下载安装包。

#### Scenario: 自签名产物指定需求为证书锚定

自签名产物 zip 内 app 执行 `codesign -d --requirements -`，输出为 `identifier "com.webdeck.app" and certificate root = H"<证书SHA-1>"` 形式（非 `cdhash H"..."`）；流水线出包断言校验该形式，回归为 ad-hoc 时 job 失败。

#### Scenario: 无证书环境构建成功且签名可校验

本机/CI 未配置任何证书时运行发布流水线 ad-hoc 兜底分支构建成功，产物为 ad-hoc 签名的 WebDeck.app；其更新 zip 内 app 执行 `codesign --verify --deep --strict` 通过（`Sealed Resources` 完整），README 记录无证书构建方式（`CSC_IDENTITY_AUTO_DISCOVERY=false`）与 Gatekeeper 放行指引。

#### Scenario: ad-hoc 兜底产物自动更新不可用有据可查

已安装 ad-hoc 旧版（如 v0.1.16）的客户端检测到 ad-hoc 新版本 zip，点击"立即安装"后 Squirrel.Mac 校验失败并给出可见错误（"更新包已下载但安装失败"），界面提供打开下载页回退；README 说明 ad-hoc 产物需手动安装。

#### Scenario: 首个自签名版本需手动安装

用户当前安装 ad-hoc 旧版（v0.1.16），检测到首个证书签名版本（如 v0.1.18）——自动更新安装失败（旧 cdhash 指定需求校验不过），按发布说明/README 指引手动下载 dmg 安装并右键打开放行；此后 v0.1.19+ 自动更新正常。

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

README 提供完整发布流程（打 tag → CI 构建 → Releases 下载）、Windows 使用说明（Shell 命令 `%USERPROFILE%` / `cd /d` 写法、中文日志 `chcp 65001` 提示）与常见问题（SmartScreen、Gatekeeper、非 Developer ID 产物说明）；Windows 签名决策（先不签或 Azure Trusted Signing）在文档中明确记录。macOS 证书说明 MUST 覆盖：自签名证书生成指引（openssl 创建含 codeSigning EKU 的证书 → 导入钥匙串 → 导出 p12 → base64 配置为 `CSC_LINK`）、私钥保管与有效期建议（10–20 年，需求绑定证书哈希、证书失效/私钥丢失后更新即失败）、`-unsigned` 后缀语义（"未用 Developer ID 签名"，含自签名与 ad-hoc）、以及"首个证书签名版本需手动安装"过渡说明。

#### Scenario: 按 README 完成一次发布

维护者按 README 发布流程打 tag 并推送，CI 完成后在 Releases 页面拿到三平台安装包，全程无需口头/线下沟通额外步骤。

#### Scenario: 维护者按 README 配置自签名证书

维护者无 Apple 付费证书，按 README 指引用 openssl 生成自签名代码签名证书并导出 p12、base64 填入 GitHub secrets（`CSC_LINK`/`CSC_KEY_PASSWORD`），推送 tag 后 CI 产出带 `-unsigned` 后缀的证书签名 mac 产物，客户端可自动更新。

#### Scenario: Windows 用户在文档中找到 Shell 命令写法

Windows 用户配置 Shell 命令时按 README 示例（`cd /d %USERPROFILE%\dsh && pnpm dsh`）填写，本地服务正常拉起；输出中文日志的应用在日志面板显示不乱码（按提示使用 `chcp 65001`）。

### Requirement: 发布物包含更新元数据

GitHub Releases 发布物除安装包外包含 electron-builder 生成的更新元数据文件（`latest*.yml`），客户端据此检查版本、校验文件完整性（sha512）并定位下载地址；元数据随每次 tag 构建自动生成并上传。macOS 更新 zip（含 unsigned 分支产物）内 MUST 携带 `Contents/Resources/app-update.yml`（provider/owner/repo/updaterCacheDirName），打包态客户端据此解析更新源；发布流水线 MUST 在出包后断言产物含更新配置，缺失即构建失败。

#### Scenario: 打 tag 后 Releases 含更新元数据

维护者打 tag 触发发布流水线，GitHub Releases 页面出现 `latest.yml`（Windows）与 `latest-mac.yml` / `latest-linux.yml` 等元数据文件，安装版客户端可据此检查到新版本。

#### Scenario: 无更新元数据时客户端不误报

若某次发布缺少元数据文件（如手工上传产物），客户端更新检查不报错误导用户，按无更新或检查失败处理，不影响应用使用。

#### Scenario: 打包产物携带更新配置

用户安装 macOS 版本（含 unsigned 产物）后点击「帮助 → 检查更新…」，更新服务能读取到应用包内 `app-update.yml` 正常发起检查，不出现 `ENOENT ... app-update.yml` 类错误。

#### Scenario: 产物缺失更新配置时流水线失败

发布流水线构建完成但产物 zip 内未发现 `app-update.yml`（如构建流程回归），对应平台 job 以失败结束，该 release 保持草稿状态、不对外可见。

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

GitHub Releases 上的更新元数据（`latest*.yml`）中每个文件 url 必须与同 release 的实际资产文件名**完全一致**（含 `-unsigned` 后缀等命名规则）——命名差异（构建后重命名、artifactName 漂移）必须在构建时消除，客户端按元数据下载不得出现 404。签名分支改为"先签名后打包"流程后，构建时生成的元数据与实际资产名仍须保持一致（构建后禁止重命名产物）。

#### Scenario: 客户端按元数据下载成功

用户安装版检查到新版本后，按 `latest*.yml` 的 url 下载更新包成功（文件存在、sha512 校验通过），不出现 `status 404` 下载失败。

#### Scenario: 非 Developer ID 产物命名一致

证书签名（自签名等）与 ad-hoc 兜底构建的 mac 产物（均带 `-unsigned` 后缀）在 `latest-mac.yml` 中 url 与实际资产名一致（如 `WebDeck-0.1.18-arm64-mac-unsigned.zip`），客户端可下载；"先签名后打包"流程下该命名约定保持不变。
