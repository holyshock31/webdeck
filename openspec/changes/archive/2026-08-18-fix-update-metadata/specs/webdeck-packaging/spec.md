# WebDeck Packaging Specification

## ADDED Requirements

### Requirement: 更新元数据与实际资产一致

GitHub Releases 上的更新元数据（`latest*.yml`）中每个文件 url 必须与同 release 的实际资产文件名**完全一致**（含未签名 `-unsigned` 后缀等命名规则）——命名差异（构建后重命名、artifactName 漂移）必须在构建时消除，客户端按元数据下载不得出现 404。

#### Scenario: 客户端按元数据下载成功

用户安装版检查到新版本后，按 `latest*.yml` 的 url 下载更新包成功（文件存在、sha512 校验通过），不出现 `status 404` 下载失败。

#### Scenario: 未签名产物命名一致

未签名构建的 mac 产物（`-unsigned` 后缀）在 `latest-mac.yml` 中 url 与实际资产名一致（如 `WebDeck-0.1.10-arm64-mac-unsigned.zip`），客户端可下载。
