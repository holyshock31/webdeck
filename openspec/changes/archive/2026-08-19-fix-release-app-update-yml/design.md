## Context

根因证据见 proposal.md。当前 `release.yml` macOS unsigned 分支：`npx electron-builder --mac dir --publish never` → `codesign --force --deep --sign -` → `codesign --verify --deep --strict` → `npx electron-builder --mac --prepackaged <app> --publish never`。electron-builder 源码（app-builder-lib PublishManager onAfterPack）确认：app-update.yml 仅当 targets 含 dmg/zip 时写入——`dir` 阶段跳过；`--prepackaged` 阶段（CI 产物实测 + 本地复现）不补写。已本地实测直接构建生成的 app-update.yml 内容为：
```yaml
owner: holyshock31
repo: webdeck
provider: github
updaterCacheDirName: webdeck-updater
```

## Goals / Non-Goals

**Goals**
- unsigned 分支产物（dmg/zip）内携带 app-update.yml，打包态更新检查恢复。
- 流水线自检：产物缺更新配置即失败，防回归。

**Non-Goals**
- 不改变签名/公证流程、产物命名、draft release 上传方式。
- 不新增运行时依赖或应用代码改动。

## Decisions

**D1: 注入方式——出包前把 app-update.yml 写进已签名 .app 的 Resources**
- 方案：`--prepackaged` 步骤前插入 `printf` 写 `$APP_PATH/Contents/Resources/app-update.yml`（内容四行 YAML，与 electron-builder 直接构建生成一致），随后 `--prepackaged` 出 dmg/zip 时自然携带。
- 备选：改用 `--publish onTagOrDraft` 让 electron-builder 自行生成（会改变发布行为——electron-builder 直接接管 GitHub release 创建/上传，与现有"softprops 上传 draft + 人工确认"设计冲突）；手工改 dmg 内容（复杂、易错）。
- 理由：最小侵入；注入发生在 codesign 之后（不破坏签名密封——app-update.yml 位于 Resources 且 codesign 已先完成，`--prepackaged` 不会重新签名该 .app；若未来需重签，资源变化会破坏签名校验，故注入必须放在签名之后、打包之前）。
- 注意：ad-hoc 签名在注入前完成，注入新增文件不会导致 Squirrel.Mac 签名校验失败（Squirrel 校验的是应用签名，新增 Resources 文件不影响已签名的 CodeDirectory/SealedResources——签名已包含 Resources 目录结构？**风险点见 Risks**）。

**D2: 断言方式——出包后检查 zip 内 app-update.yml**
- 方案：dmg/zip 构建完成后执行 `unzip -l dist/WebDeck-*-mac-*.zip | grep -q 'Contents/Resources/app-update.yml'`，失败即 `exit 1`（job 失败，release 保持 draft）。
- 备选：断言 dmg（需 hdiutil 挂载，CI 上更重）；只检查 zip（zip 与 dmg 同源同批，足够）。
- 理由：轻量、可定位（失败信息指明缺哪个文件）。

**D3: 注入内容来源——写死四行，不依赖 electron-builder 生成**
- 方案：YAML 内容硬编码在工作流中（owner/repo/provider/updaterCacheDirName）。
- 备选：本地先构建提取（CI 上多一步构建，浪费）；运行时拼装（无必要）。
- 理由：内容稳定且已实测与生成版一致；updaterCacheDirName=webdeck-updater 取自 appInfo（productName 派生），固定值。

## Risks / Trade-offs

- [注入时机与签名密封冲突：ad-hoc 签名已包含 Resources 密封，签名后新增文件可能导致 codesign --verify 或 Squirrel 校验失败] → 实测验证：本机对 dist/mac-arm64/WebDeck.app 执行 codesign 后写入 app-update.yml 再 `codesign --verify --deep --strict`，若失败则把注入移到 codesign **之前**（方案保留：注入在 `--mac dir` 之后、codesign 之前亦可——`--mac dir` 输出的 .app 不含 app-update.yml，此时写入再签名，密封资源包含该文件，最稳妥）。任务 1.2 先本地验证两种顺序。
- [Windows/Linux 产物同样依赖 app-update.yml（electron-updater 跨平台同机制），但 v0.1.15 未回归（直接构建流程仍生成）] → 本次仅修复 unsigned mac 分支；断言步骤可顺带覆盖 latest*.yml 上传一致性（既有需求已有），不扩范围。
- [修复仅对下次 tag 生效，已装 v0.1.15 用户仍报错] → 打 v0.1.16 补发；README 无改动（发布流程文档不变）。

## Migration Plan

- 纯流水线改动：下次打 tag 自动生效；无需数据迁移。
- 回滚：移除注入与断言步骤即可回到现状（但会再次破坏更新）。

## Open Questions

无。
