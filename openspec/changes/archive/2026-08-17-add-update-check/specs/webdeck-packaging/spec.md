# WebDeck Packaging Specification

## ADDED Requirements

### Requirement: 发布物包含更新元数据

GitHub Releases 发布物除安装包外包含 electron-builder 生成的更新元数据文件（`latest*.yml`），客户端据此检查版本、校验文件完整性（sha512）并定位下载地址；元数据随每次 tag 构建自动生成并上传。

#### Scenario: 打 tag 后 Releases 含更新元数据

维护者打 tag 触发发布流水线，GitHub Releases 页面出现 `latest.yml`（Windows）与 `latest-mac.yml` / `latest-linux.yml` 等元数据文件，安装版客户端可据此检查到新版本。

#### Scenario: 无更新元数据时客户端不误报

若某次发布缺少元数据文件（如手工上传产物），客户端更新检查不报错误导用户，按无更新或检查失败处理，不影响应用使用。
