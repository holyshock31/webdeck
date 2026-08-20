## Why

macOS 自动更新在无 Apple Developer 证书（$99/年付费）的环境下一直失败：Squirrel.Mac 用**已安装 app 的指定需求**（designated requirement）校验更新包，而 ad-hoc 签名的指定需求是 `cdhash H"..."`（该构建二进制哈希）——任何新版本二进制哈希必然不同，校验恒失败（`-67050 code failed to satisfy specified code requirement(s)`，v0.1.16→v0.1.17 实测复现）。上一变更 `fix-mac-unsigned-update` 只验证了包自洽性（`codesign --verify` 必然通过），未覆盖跨版本校验，故"待发布期验收"一跑即失败。

实验已证实：**自制证书（自签名）签名**的指定需求是 `identifier "com.webdeck.app" and certificate root = H"<证书SHA-1>"`——绑定证书而非二进制哈希，同一证书签出的任意新版本都能通过 Squirrel.Mac 跨版本校验（本地双版本实测 PASS），且校验不依赖本机信任库、不联网，任何 Mac 上行为一致。零成本（无需付费），代价仅是首次手动安装 DMG 时仍需右键打开（与现状 ad-hoc 体验相同）。

同时发现 CI 触发 bug：`release.yml` 中 signed 分支的 `if: env.CSC_LINK != ''` 读不到 step 级 env（GitHub runner 源码 StepsRunner.cs 实锤：step `if` 求值时 env context 只含 workflow/job 级变量）——即使配置了 secrets 该分支也永远不会触发。

本变更让无证书环境下 macOS 自动更新真正可用：自签名证书签名 + CI 触发修正 + 过渡期手动安装指引。

## What Changes

- **`.github/workflows/release.yml` 触发条件修复**：secrets 不可直接用于 step `if`（官方上下文可用性表），改用 job 级 env 标志（`HAS_CSC_LINK: ${{ secrets.CSC_LINK != '' }}`、`HAS_APPLE_CREDS: ${{ secrets.APPLE_TEAM_ID != '' }}`）驱动三个互斥分支：
  1. 有 `CSC_LINK` + Apple 公证凭据 → **Developer ID 签名 + 公证**（现有已写分支，修复触发后首次可用）
  2. 有 `CSC_LINK`、无 Apple 凭据 → **用 CSC_LINK 证书签名、不公证**（自签名或任何 p12 证书均可；Squirrel.Mac 校验通过）
  3. 无 `CSC_LINK` → 现有 **ad-hoc unsigned 兜底分支**（行为不变，保证无凭据环境仍能出包）
- **自签名分支出包流程**：`electron-builder --mac dir` → 注入 `app-update.yml`（在签名前）→ `codesign --force --deep` 用 CSC_LINK 证书签名 → 出包断言：
  - `codesign --verify --deep --strict` 通过
  - `codesign -d --requirements -` 输出含 `certificate root = H"..."` 而非 `cdhash H"..."`（保证跨版本校验可满足，防回归到 ad-hoc）
  - zip 内携带 `app-update.yml`
  - 产物命名保持 `-unsigned` 后缀约定（语义="未用 Developer ID 签名"，含自签名产物），latest-mac.yml 自动一致
- **过渡期行为（文档明确）**：已安装 ad-hoc 旧版（v0.1.16 及更早）的机器，其 Squirrel.Mac 仍用旧 cdhash 需求校验，**首个自签名版本必须手动下载 DMG 安装**（右键打开放行）；安装后后续版本自动更新恢复正常。发布说明/README 写明。
- **README/文档**：新增自签名证书生成与配置指引（openssl 生成 → 导入钥匙串 → 导出 p12 → base64 为 `CSC_LINK`）、私钥保管与有效期建议（10–20 年）、`-unsigned` 后缀语义更新（自签名产物可自动更新）。
- **客户端零改动**：`src/**` 不动；错误上报/下载页兜底链路已具备（fix-mac-unsigned-update 已实现）。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `webdeck-packaging`: 修改「macOS 安装包签名与公证」——无证书环境从"ad-hoc 签名可被 Squirrel.Mac 接受"（事实不成立）改为"提供 CSC_LINK 证书时签名产物可完成自动更新（自签名可用），ad-hoc 仅作无凭据兜底"；新增自签名产物的指定需求断言；新增"首个自签名版本需手动安装"过渡行为。修改「更新元数据与实际资产一致」——`-unsigned` 后缀语义扩展至自签名产物（命名约定不变）。修改「发布流程与平台差异有文档指引」——README 增加自签名证书生成/配置/保管与过渡安装指引。

## Impact

- `.github/workflows/release.yml`：触发条件重构 + 自签名分支新增（主要改动）
- `README.md`、`docs/**`：签名/更新文档同步
- `openspec/specs/webdeck-packaging/spec.md`：规格增量合入
- 客户端 `src/**`、`package.json`：**无改动**
- 发布产物：自签名 zip 仍为 `-unsigned` 后缀；Developer ID 签名 zip 无后缀（首次可用）
