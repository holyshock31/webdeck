## Context

- 现状（release.yml macOS 三步）：signed+notarized 分支（`if: env.CSC_LINK != ''`，从未触发）、unsigned ad-hoc 分支（先 dir 构建 → 注入 app-update.yml → ad-hoc 签名 → prepackaged 出包 → 断言）。详见 proposal.md — Why。
- 已证实的事实（本机实验）：
  1. ad-hoc 指定需求 = `cdhash H"..."`，跨版本校验恒失败（-67050，Squirrel.Mac 复现脚本与用户报错逐字一致）。
  2. 自签名证书指定需求 = `identifier "com.webdeck.app" and certificate root = H"<证书SHA-1>"`，同一证书的新版本跨版本校验 PASS（双版本实测），不依赖本机信任库（证书本机未受信任状态下仍 PASS）。
  3. GitHub Actions：`steps.if` 允许 `env` context、不允许 `secrets` context（官方上下文可用性表）；step 的 `if` 求值时 env context 只含 workflow/job 级变量，不含 step 自身 `env:`（runner 源码 StepsRunner.cs：envContext 仅从 Global.EnvironmentVariables 构建，step env 在条件求值后才合并）。
  4. electron-builder 26.15.3：`mac.notarize` 存在（schema 确认）；`hardenedRuntime` 默认 true；CSC_LINK 机制 = 临时钥匙串导入 + codesign；identity 发现用 `security find-identity -v`（**仅有效=受信任身份**，macCodeSign.js `getValidIdentities`），但 `_findIdentity` 对 "Developer ID Application" 有**非 Apple 证书回退**（"custom non-Apple code signing certificate"，同一次 `find-identity -v` 结果中过滤 Apple 前缀）——即**证书一旦受信任，electron-builder 即可用其签名**。
  5. 本机实测链（主案，全部通过）：自签名证书加入 login keychain 信任（`security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db`，**无需 sudo**）→ `find-identity -v` 列出为有效身份 → electron-builder 用 CSC_LINK 找到身份并执行签名（日志：`signing file=... identityName=WebDeck Self-Sign Test`，`hardenedRuntime=false` 生效、命令无 `--options runtime`）；**唯一失败点**：本机不可达 Apple timestamp 服务器（timestamp.apple.com HTTP 000；GitHub 官方 macOS runner 为标准可达环境，此为所有 mac CI 签名的基础设施）。
  6. 本机实测：`codesign -d --requirements -` 对自签名产物输出 `identifier "com.webdeck.app" and certificate root = H"ce13ba09..."`；Squirrel 模拟校验（repro）跨版本 PASS。
  7. electron-builder 出包顺序（macPackager.js pack()）：`emitAfterPack`（PublishManager 在此写 `Contents/Resources/app-update.yml`，仅 dmg/zip target）→ `doSignAfterPack`（签名）——**app-update.yml 先于签名写入、进入密封资源**，因此 dmg/zip 一步出包即自带完整密封的更新配置，无需 dir→注入→手动签名的绕行流程。
  8. 备选方案（手动 codesign）端到端实测：`--mac dir --config.mac.identity=null` → 注入 app-update.yml → 签名 → `--prepackaged` 出 zip → 全部断言通过。**关键发现**：本构建（Electron 37 发行版）的部分组件为 **linker-signed**（ld 的 ad-hoc 链接器签名，`flags=0x20002(adhoc,linker-signed)`），`codesign --force --deep` 对其做**证书签名替换时稳定报 `errSecInternalComponent`**（逐个失败于 Mantle.framework、WebDeck Helper.app、Electron Framework.framework/.../Helpers/chrome_crashpad_handler），但**单独签名（无 --deep）均成功**——正确的配方是自底向上逐组件签名（与 osx-sign 遍历一致）：裸 Mach-O（dylib/Helpers 内二进制）→ 各 .framework → 各 Helper .app → 主 app，全程不带 `--deep`；最终 `codesign --verify --deep --strict` 通过，指定需求为证书锚定，zip 解压后 Squirrel 模拟跨构建校验（两个不同构建、同一证书）PASS。

## Goals / Non-Goals

**Goals:**
- 无 Apple 付费证书环境下，macOS 自动更新（Squirrel.Mac 安装链路）真正可用
- 修复 signed 分支永不触发的 CI 条件 bug，Developer ID 分支恢复可用
- 出包断言防止回归到"跨版本校验不可满足"的签名形态

**Non-Goals:**
- 不引入公证（Apple 付费服务，无凭据环境不可用）
- 不改动客户端 src/**（错误上报/下载页兜底已具备）
- 不改变 ad-hoc 无凭据兜底分支的行为

## Decisions

### 1. 自签名产物签名方式：信任证书 + electron-builder CSC_LINK 自动签名（一步出包，定案）

electron-builder 的 identity 发现只认 `find-identity -v`（受信任身份），但内置"custom non-Apple code signing certificate"回退——只要自签名证书在本机受信任，CSC_LINK 机制即可自动签名。本机实测确认整条链：证书加入 login keychain 信任（无需 sudo）→ `find-identity -v` 可见 → electron-builder 自动签名（其临时钥匙串流程对自签名证书可用，实测日志确认）。

**CI 实施方案**（主案，本机已验证至签名动作；timestamp 服务器为 CI 标准可达设施）：
1. `echo "$CSC_LINK" | base64 -d > /tmp/csc.p12`；`openssl pkcs12 -in /tmp/csc.p12 -clcerts -nokeys -out /tmp/csc-cert.pem -passin pass:"$CSC_KEY_PASSWORD"`（提取证书）
2. `security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db /tmp/csc-cert.pem`（信任证书，无需 sudo；runner 临时环境，无持久副作用）
3. `npx electron-builder --mac --publish never --config.mac.hardenedRuntime=false --config.mac.artifactName=WebDeck-${version}-${arch}-mac${env.UNSIGNED_SUFFIX}.${ext}`（一步出 dmg + zip + latest-mac.yml；app-update.yml 由 electron-builder 在签名前写入密封资源——顺序已由源码确认；electron-builder 内部经 osx-sign 逐组件签名，正确处理 linker-signed 组件）

**回退方案**（timestamp 服务器不可达时；本机端到端验证通过，含 Squirrel 跨构建校验）：`--mac dir --config.mac.identity=null`（禁自动签名）→ 注入 app-update.yml（签名前）→ 手动 `codesign` 自底向上逐组件签名（**禁用 `--deep`**——Electron 37 发行版含 linker-signed 组件，`--deep` 证书签名替换稳定报 `errSecInternalComponent`；配方：裸 Mach-O（dylib 与 Helpers 内二进制）→ 各 .framework → 各 Helper .app → 主 app，均 `--sign "<证书CN>" --timestamp=none`）→ `--prepackaged` 出包。此回退不依赖 timestamp 服务器与信任设置（登录钥匙串身份即可，未信任证书实测可签）。

### 2. hardenedRuntime 处理

- Developer ID 分支：保持默认 true（公证必需）。
- 自签名分支：显式 `--config.mac.hardenedRuntime=false`。依据：无公证需求时 hardened runtime 无收益；electron-builder schema 明确提示 ad-hoc/无 Team ID 签名下 hardened runtime 的 library validation 会拒绝携带不同 Team ID 的预签名 Electron framework——自签名证书无 Team ID，存在同类兼容风险，关闭最稳妥。实测（Decision 1 的同一构建）中验证产物可启动（smoke）。
- 风险：若关闭后仍有意外，产物验证阶段（出包断言 + 本机安装启动）会暴露。

### 3. CI 触发条件与分支互斥

job 级 env 标志（matrix 三个 runner 共享，无副作用）：

```yaml
jobs:
  build:
    env:
      HAS_CSC_LINK: ${{ secrets.CSC_LINK != '' }}
      HAS_APPLE_CREDS: ${{ secrets.APPLE_TEAM_ID != '' }}
```

三个互斥 macOS step（顺序无关，条件互斥）：
1. Developer ID 签名+公证：`runner.os == 'macOS' && env.HAS_CSC_LINK == 'true' && env.HAS_APPLE_CREDS == 'true'`（现有命令，notarize=true + teamId）
2. 证书签名不公证：`runner.os == 'macOS' && env.HAS_CSC_LINK == 'true' && env.HAS_APPLE_CREDS == 'false'`
3. ad-hoc 兜底：`runner.os == 'macOS' && env.HAS_CSC_LINK == 'false'`（现有命令不变）

`HAS_APPLE_CREDS` 以 `APPLE_TEAM_ID` 为代表（notarize 必需项；electron-builder 公证凭据三选一，现有 workflow 用 APPLE_ID + App 专用密码 + TEAM_ID 路线）。备选：shell 内 `if [[ -n "$CSC_LINK" ]]` 运行时分支——不采用：step 级互斥更直观、日志更清晰，且与现有结构一致。

### 4. 产物命名与元数据

- 自签名分支 artifactName 沿用 `WebDeck-${version}-${arch}-mac${env.UNSIGNED_SUFFIX}.${ext}`（`-unsigned`），语义="未用 Developer ID 签名"（spec 已定义），latest-mac.yml 构建时自动一致，禁止构建后重命名。
- Developer ID 分支不设 artifactName（默认名，无后缀），沿用现状。

### 5. 出包断言（防回归）

自签名分支（与现有 unsigned 分支断言同构，新增需求形态断言）：
- 签名后：`codesign --verify --deep --strict <app>` 通过
- 签名后：`codesign -d --requirements - <app>` 输出含 `certificate root = H"` 且不含 `cdhash H"`（grep 断言；失败即 job 失败）
- prepackaged 后：zip 内 `Contents/Resources/app-update.yml` 存在（沿用现有断言）
- Developer ID 分支：追加 `codesign --verify --deep --strict` 断言（公证产物必然通过，防止无签名出包）

### 6. 过渡期：首个自签名版本手动安装

已安装 ad-hoc 旧版（如 v0.1.16）的机器，Squirrel.Mac 仍以旧 cdhash 需求校验 → 首个证书签名版本自动安装失败是**预期行为**，非缺陷：
- README FAQ + 发布说明写明："自 v0.1.18 起改用证书签名，旧版（v0.1.16 及更早）用户请手动下载 dmg 安装一次（右键打开），此后自动更新恢复。"
- 客户端错误路径已存在（"更新包已下载但安装失败" + 打开下载页），无需改动。

### 7. README 自签名证书指引

给出本实验验证过的完整命令链：openssl 生成（含 codeSigning EKU 的 cnf）→ `security create-keychain`/`security import`/`set-key-partition-list` → `security export` 导出 p12 → `base64` 填入 `CSC_LINK`；说明私钥保管（泄露=可冒名签名）与有效期建议（10–20 年，指定需求绑定证书哈希，证书失效/私钥丢失后更新即失败、需重装过渡）。

## Risks / Trade-offs

- [CI runner 不可达 Apple timestamp 服务器（本机实测 HTTP 000）→ electron-builder 自动签名失败] → GitHub 官方 macOS runner 为标准可达环境；若实测仍失败，启用 Decision 1 的备选方案（手动 codesign `--timestamp=none`，本机端到端验证过）。
- [自签名 + hardenedRuntime 兼容性（library validation 拒绝预签名 framework）] → 自签名分支显式关闭 hardenedRuntime（`--config.mac.hardenedRuntime=false`）；出包断言 + 本机安装启动验证兜底。
- [证书/私钥丢失或过期导致更新永久失败] → README 明示保管要求与有效期建议；证书有效期 10–20 年。
- [`-unsigned` 后缀语义与"自签名"名称矛盾，用户困惑] → spec 与 README 统一语义："未用 Developer ID 签名"；后缀仅为命名约定，不影响可安装性与自动更新。
- [CI 条件判断仅以 APPLE_TEAM_ID 代表公证凭据，凭据不完整时进入"签名不公证"分支（公证期望落空）] → 属可接受降级（产物仍签名可用），README 说明三种分支的凭据要求；如发现误判可在后续变更中细化。
- [`security add-trusted-cert` 在 CI runner 上的可用性] → 本机已实测无需 sudo 可用；runner 为临时环境，信任设置无持久副作用；任务 1.1 在真实 CI 验证。

## Migration Plan

1. 本机实测（已完成，见 Context 第 5/6 点）：信任证书 + electron-builder 自动签名链路、指定需求形态、Squirrel 跨版本模拟校验均验证通过；实施阶段在真实 CI runner 上复测（任务 1.1/1.2）。
2. 合入本变更 → 发布 v0.1.18（自签名 `-unsigned` zip + dmg）→ 本机手动装 dmg（过渡安装）→ 验证自动更新检查正常。
3. 发布 v0.1.19 → 本机 0.1.18 → 0.1.19 自动更新真实链路验收（补上 fix-mac-unsigned-update 遗留的"待发布期验收"）。
4. 回滚：若真实链路失败，回滚 release.yml 到 ad-hoc 兜底行为（行为不劣于现状），证书签名流程留待修复。

## Open Questions

- 无（timestamp 服务器可达性为 CI 环境性因素，已在决策 1 备选方案中覆盖）。
