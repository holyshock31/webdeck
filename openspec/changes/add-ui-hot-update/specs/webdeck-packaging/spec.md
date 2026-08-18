# WebDeck Packaging Specification

## ADDED Requirements

### Requirement: UI manifest 自动生成与发布

仓库提供 `scripts/build-ui-manifest.js`：遍历 `src/renderer/**`（含 icons/）计算每个文件的 sha256 与 size，以当前 git commit SHA 为 `ref`，`version` 由调用方传入（格式 `YYYY.MM.DD.N`，单调递增），生成 `docs/ui/latest.json`。CI 工作流（`ui-manifest.yml`）在 main 分支的 renderer/preload/构建脚本变更时自动构建并提交该 manifest；`release.yml` 打 tag 时同步生成——保证热更新源与整包发布携带的 UI 一致。

#### Scenario: 界面改动自动发布 UI 热更新

开发者修改 `src/renderer/app.js` 并推送到 main——CI 自动重新生成并提交 `docs/ui/latest.json`（version 递增、ref 指向该 commit、sha256 更新），用户端无需任何整包即可获取新 UI。

#### Scenario: 打 tag 时同步生成

打 v0.2.0 tag 触发 release.yml——构建产物携带内置 UI 的同时，`docs/ui/latest.json` 也更新为对应版本，热更新源与整包 UI 不漂移。

#### Scenario: 与 UI 无关的改动不触发

仅修改 `src/main/` 或文档且推送到 main——不生成新的 UI manifest，热更新源保持原样。

### Requirement: UI 热更新与整包发布解耦

UI 变更（minAppVersion 不提高的前提下）不需要发布新应用版本即可送达用户：manifest 更新后，用户下次启动或手动「检查界面更新」即自动应用；UI 依赖新主进程能力时通过提高 `minAppVersion` 声明兼容门槛，旧版应用安全跳过，新版应用（整包升级后）自动回内置再热更新——两套分发通道互不阻塞。

#### Scenario: 仅 UI 变更不发版

某次改动只涉及界面（无主进程改动）——只更新 `docs/ui/latest.json`，不发布新应用版本，用户通过热更新获得新界面。

#### Scenario: 依赖新 IPC 的 UI 被旧版跳过

UI 引入了仅 0.2.0 主进程才有的 IPC，manifest 的 minAppVersion 设为 0.2.0——运行 0.1.8 的用户跳过该 UI 更新并保持可用；升级到 0.2.0 后自动应用。
