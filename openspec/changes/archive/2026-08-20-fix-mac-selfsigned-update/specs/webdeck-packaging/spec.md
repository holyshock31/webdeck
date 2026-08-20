## MODIFIED Requirements

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

### Requirement: 更新元数据与实际资产一致

GitHub Releases 上的更新元数据（`latest*.yml`）中每个文件 url 必须与同 release 的实际资产文件名**完全一致**（含 `-unsigned` 后缀等命名规则）——命名差异（构建后重命名、artifactName 漂移）必须在构建时消除，客户端按元数据下载不得出现 404。签名分支改为"先签名后打包"流程后，构建时生成的元数据与实际资产名仍须保持一致（构建后禁止重命名产物）。

#### Scenario: 客户端按元数据下载成功

用户安装版检查到新版本后，按 `latest*.yml` 的 url 下载更新包成功（文件存在、sha512 校验通过），不出现 `status 404` 下载失败。

#### Scenario: 非 Developer ID 产物命名一致

证书签名（自签名等）与 ad-hoc 兜底构建的 mac 产物（均带 `-unsigned` 后缀）在 `latest-mac.yml` 中 url 与实际资产名一致（如 `WebDeck-0.1.18-arm64-mac-unsigned.zip`），客户端可下载；"先签名后打包"流程下该命名约定保持不变。

### Requirement: 发布流程与平台差异有文档指引

README 提供完整发布流程（打 tag → CI 构建 → Releases 下载）、Windows 使用说明（Shell 命令 `%USERPROFILE%` / `cd /d` 写法、中文日志 `chcp 65001` 提示）与常见问题（SmartScreen、Gatekeeper、非 Developer ID 产物说明）；Windows 签名决策（先不签或 Azure Trusted Signing）在文档中明确记录。macOS 证书说明 MUST 覆盖：自签名证书生成指引（openssl 创建含 codeSigning EKU 的证书 → 导入钥匙串 → 导出 p12 → base64 配置为 `CSC_LINK`）、私钥保管与有效期建议（10–20 年，需求绑定证书哈希、证书失效/私钥丢失后更新即失败）、`-unsigned` 后缀语义（"未用 Developer ID 签名"，含自签名与 ad-hoc）、以及"首个证书签名版本需手动安装"过渡说明。

#### Scenario: 按 README 完成一次发布

维护者按 README 发布流程打 tag 并推送，CI 完成后在 Releases 页面拿到三平台安装包，全程无需口头/线下沟通额外步骤。

#### Scenario: 维护者按 README 配置自签名证书

维护者无 Apple 付费证书，按 README 指引用 openssl 生成自签名代码签名证书并导出 p12、base64 填入 GitHub secrets（`CSC_LINK`/`CSC_KEY_PASSWORD`），推送 tag 后 CI 产出带 `-unsigned` 后缀的证书签名 mac 产物，客户端可自动更新。

#### Scenario: Windows 用户在文档中找到 Shell 命令写法

Windows 用户配置 Shell 命令时按 README 示例（`cd /d %USERPROFILE%\dsh && pnpm dsh`）填写，本地服务正常拉起；输出中文日志的应用在日志面板显示不乱码（按提示使用 `chcp 65001`）。
