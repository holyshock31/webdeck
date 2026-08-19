# fix-mac-unsigned-update — Design

## Context

见 proposal.md - Why。要点：v0.1.14 的 mac 更新包（`WebDeck-*-mac-unsigned.zip`）内 app 的签名是不完整的 linker-signed adhoc（`Sealed Resources=none`），`codesign --verify` 失败；Squirrel.Mac（ShipIt）在安装前校验新 app 签名，校验失败即中止安装，而 UI 静默。另：现有 `webdeck-core` 规格「macOS（未签名）不做自动安装」与实现（给了"立即安装"按钮）本就漂移。

关键事实（本机实测）：
- 对 zip 内 app 执行 `codesign --force --deep --sign -` 后，`codesign --verify --deep --strict` 通过（exit 0，`Sealed Resources version=2 rules=13 files=12`）→ 修复方向成立。
- electron-updater 下载 zip 走 Node http（非浏览器），zip 不带 `com.apple.quarantine` → 更新安装后的新 app 不被 Gatekeeper 拦截；手动从浏览器下载 dmg 才有 quarantine（README 已有右键打开指引）。
- 客户端日志确认错误经 `autoUpdater` 'error' 事件已广播到渲染层（`[updater] error ...`），只是渲染层 `case 'error'` 仅 `manualCheck` 时 alert。

## Goals / Non-Goals

**Goals**
- 无 Apple 开发者证书（unsigned 分支）也能产出 Squirrel.Mac 可接受的 mac 更新包，让"立即安装"在 macOS 真正可用。
- 安装失败（无论自动/手动触发）在界面可见，并提供"打开下载页"兜底。
- 保持产物命名（`-unsigned` 后缀）与 `latest-mac.yml` 一致性约定不变。

**Non-Goals**
- 不引入 Developer ID 证书/公证（有证书时走既有 signed+notarized 分支，本设计只动 unsigned 分支）。
- 不改 Windows/Linux 构建与 portable 行为。
- 不改变更新检查调度、下载、取消、偏好开关等既有机制。

## Decisions

### D1: unsigned 分支改为「构建 dir → ad-hoc 签名 → prepackaged 出包」

流程（仅 `CSC_LINK == ''` 的 mac job）：
1. `npx electron-builder --mac dir --publish never`（只出 `dist/mac-arm64/WebDeck.app`，不产 zip）
2. `codesign --force --deep --sign - dist/mac-arm64/WebDeck.app`（完整 ad-hoc 签名，密封资源）
3. `npx electron-builder --mac --prepackaged dist/mac-arm64/WebDeck.app --publish never --config.mac.artifactName=WebDeck-\${version}-\${arch}-mac\${env.UNSIGNED_SUFFIX}.\${ext}`（产出 dmg + zip + `latest-mac.yml`）

**为什么选 `--prepackaged` 而不是手工重打包 zip**：`latest-mac.yml` 的 url、sha512、blockmap 全部由 electron-builder 在打包时生成——用 prepackaged 入口，元数据与实际资产天然一致，满足「更新元数据与实际资产一致」规格；手工 `ditto` 重打包则要自行维护元数据一致性（仓库已明令禁止构建后重命名，手工重打包同样违反该约定精神）。
**备选**：对整 zip 解压 → 签名 → 重新 `ditto -c -k` 压缩并手工改元数据 —— 否决：元数据风险高、无收益。
**风险点**：`--prepackaged` 是否会再次剥签/重签？electron-builder 对 prepackaged 目录跳过签名步骤（视为已签好）；CI 中在出包后加 `codesign --verify --deep --strict` 断言步骤兜底（失败即 job 失败，防止把坏包发出去）。

### D2: 渲染层安装失败可见 + 下载页兜底

- 主进程：`quitAndInstall()` 包 try/catch，异常经既有 `broadcast('error', ...)` 上报（electron-updater 自身也会经 'error' 事件上报，双保险、幂等）；不动 `updater:open-download`（已存在）。
- 渲染层：`updState` 增加安装失败标记；`case 'error'` 由「仅 manualCheck alert」放宽为「若处于已下载待安装状态（`updState.downloaded === true`）→ 弹窗/提示条展示错误消息 + 「打开下载页」按钮（复用 `webdeck.openDownloadPage`）；手动检查场景保持原 alert 行为」。下一次 `available`/`downloaded`/`cancelled` 事件到来时清除失败态（用户重试/新检查后不再显示陈旧错误）。
- 交互语义：失败后「立即安装」仍可重试（如网络瞬时问题重试），但错误必须可见——按钮旁/弹窗内展示失败原因，不再"点了没反应"。

**为什么不做「macOS 一律只给下载页」**：spec 修正方向是 unsigned 产物经 ad-hoc 签名后自动安装可用（D1 已使其成立），一刀切退回下载页会牺牲已验证可行的自动更新体验，也与用户选择的修复范围（两者都修）不符。

### D3: 规格修正

`webdeck-core`「更新安装的平台分派」：macOS（unsigned、ad-hoc 签名通过）走自动安装；安装失败可见 + 下载页兜底。「更新检查失败可恢复」：安装阶段失败无论触发场景都提示。`webdeck-packaging`：无证书构建须完整 ad-hoc 签名且 `codesign --verify` 通过；命名约定不变。

## Risks / Trade-offs

- [`--prepackaged` 行为与本地 electron-builder 版本相关（v26）] → CI 出包后加 `codesign --verify --deep --strict` 断言步骤；本机已用同版本 electron-builder 验证过签名原理，落地时以 CI 断言为准。
- [ad-hoc 签名 app 在用户手动安装 dmg 时仍触发 Gatekeeper] → 既有行为，README 已有右键打开指引；自动更新路径无 quarantine，不受影响。
- [`--deep` 签名对嵌套 helper 的告警/未来 macOS 限制] → 本地实测通过；若 CI 上 `--deep` 不稳定，可退化为先签 Frameworks/Helpers 再签主 app（同一命令拆两步，方案不变）。
- [`-unsigned` 后缀语义漂移（实际已 ad-hoc 签名）] → 命名稳定优先（元数据一致性规格约束），README/设计注释说明该后缀仅表示"未用 Developer ID 签名"。
- [已下载的坏包（如本机 0.1.14）重试仍失败] → 不可修旧包；新版本（含修复后流水线产物）发布后，下次检查会重新下载覆盖；失败可见性让用户知道该走下载页。

## Migration Plan

- 部署：合并本变更后，下一次打 tag 的 unsigned 分支即产出可自动安装的 mac 包（v0.1.15+）；本机 v0.1.13 用户点击更新到新版本即可。
- 回滚：流水线改动回滚 = revert workflow 文件；UI 改动为纯增量，回滚无兼容问题。
- 验收：本地用修复后流程构建一次（`--mac dir` → ad-hoc 签名 → 验证），并用 `codesign --verify --deep --strict` 断言；发布后可在 mac 上走一次真实更新（依赖一次 tag 发布，属发布期验收）。

## Open Questions

无。
