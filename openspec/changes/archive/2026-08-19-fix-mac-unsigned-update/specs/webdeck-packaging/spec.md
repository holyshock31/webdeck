## MODIFIED Requirements

### Requirement: macOS 安装包签名与公证

macOS 构建产物使用 Developer ID 证书签名并完成 Apple 公证（CI 配置 `CSC_LINK` / `CSC_KEY_PASSWORD` 与公证凭据时）；签名公证后的 dmg 首次打开不触发 Gatekeeper 拦截。未配置证书时构建可跳过正式签名（开发态/无凭据环境），但**必须对 .app 做完整 ad-hoc 签名**（`codesign --force --deep --sign -`，密封资源）后再产出安装包与更新 zip——产物可用（首次安装需右键打开或按 README 指引放行），且更新 zip 内 app 通过 `codesign --verify --deep --strict` 校验、可被 Squirrel.Mac 接受完成自动安装；产物命名保持既有 `-unsigned` 后缀约定（仅标识"未用 Developer ID 签名"，不影响可安装性）。

#### Scenario: 已签名公证的 dmg 可直接安装

用户从 Releases 下载 dmg，双击挂载并拖入应用程序，首次启动不被 Gatekeeper 拦截，直接进入 WebDeck 界面。

#### Scenario: 未配置证书构建成功且签名可校验

本机未配置 Apple 证书时运行发布流水线 unsigned 分支构建成功，产物为 ad-hoc 签名的 WebDeck.app；其更新 zip 内 app 执行 `codesign --verify --deep --strict` 通过（`Sealed Resources` 完整），README 记录无证书构建方式（`CSC_IDENTITY_AUTO_DISCOVERY=false`）与 Gatekeeper 放行指引。

#### Scenario: unsigned 更新包可完成自动安装

维护者在无 Apple 证书的 CI 环境发布 mac 版本（`-unsigned` 后缀 zip），客户端检测到新版并下载后，用户点击"立即安装"——Squirrel.Mac 签名校验通过，安装完成并自动重启进入新版本，无需手动下载安装包。

### Requirement: 更新元数据与实际资产一致

GitHub Releases 上的更新元数据（`latest*.yml`）中每个文件 url 必须与同 release 的实际资产文件名**完全一致**（含未签名 `-unsigned` 后缀等命名规则）——命名差异（构建后重命名、artifactName 漂移）必须在构建时消除，客户端按元数据下载不得出现 404。unsigned 分支改为"先签名后打包"流程后，构建时生成的元数据与实际资产名仍须保持一致（构建后禁止重命名产物）。

#### Scenario: 客户端按元数据下载成功

用户安装版检查到新版本后，按 `latest*.yml` 的 url 下载更新包成功（文件存在、sha512 校验通过），不出现 `status 404` 下载失败。

#### Scenario: 未签名产物命名一致

未签名构建的 mac 产物（`-unsigned` 后缀）在 `latest-mac.yml` 中 url 与实际资产名一致（如 `WebDeck-0.1.10-arm64-mac-unsigned.zip`），客户端可下载；改为"先 ad-hoc 签名再打包"后该命名约定保持不变。
