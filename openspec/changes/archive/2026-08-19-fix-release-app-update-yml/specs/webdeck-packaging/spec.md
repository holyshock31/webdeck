## MODIFIED Requirements

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
