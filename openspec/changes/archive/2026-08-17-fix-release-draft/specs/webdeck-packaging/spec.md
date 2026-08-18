# WebDeck Packaging Specification

## ADDED Requirements

### Requirement: 发布产物经人工确认后才对外可见

打 tag 触发的发布流水线把三平台资产上传到 **draft（草稿）release**，不自动发布、不自动标记 Latest；维护者在 GitHub Releases 页面确认资产齐全后手动 **Publish release**，此后客户端（electron-updater）才能检测到该版本并下载。任一平台构建失败时，release 保持草稿状态、客户端不可见。

#### Scenario: 平台构建失败时客户端不受影响

某版本 Windows 构建失败，macOS/Linux 资产已上传——release 保持 draft 状态，已安装旧版客户端检查更新不检测到该版本，不出现下载 404。

#### Scenario: 人工发布后客户端可检测

维护者确认三平台资产齐全后手动 Publish release，客户端检查更新检测到新版本并正常下载安装。
