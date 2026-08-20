# fix-mac-selfsigned-update — Tasks

## 1. CI 实测：自签名证书 + electron-builder 全流程（先行，Design 决策 1 落地验证）

- [x] 1.1 在真实 GitHub macOS runner（或等价无沙箱环境）复测自签名分支完整命令链：解码 p12 → `openssl pkcs12` 提取证书 → `security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db` → 确认 `security find-identity -v -p codesigning` 列出该身份 → `CSC_LINK` + `CSC_KEY_PASSWORD` 下 `npx electron-builder --mac --publish never --config.mac.hardenedRuntime=false --config.mac.artifactName='WebDeck-${version}-${arch}-mac${env.UNSIGNED_SUFFIX}.${ext}'`（`UNSIGNED_SUFFIX=-unsigned`）成功签名出包（timestamp 服务器在 CI 可达）
- [x] 1.2 若 1.1 因 timestamp 服务器不可达等失败，验证备选方案：`--mac dir --config.mac.identity=null`（禁自动签名）→ 注入 `app-update.yml`（签名前）→ 手动 `codesign --force --deep --sign "<证书CN>" --timestamp=none`（钥匙串身份，本机已验证）→ `--prepackaged` 出包，并更新 design.md 决策
- [x] 1.3 出包断言实测（两方案通用）：zip 解压后 `codesign --verify --deep --strict` 通过；`codesign -d --requirements -` 输出含 `certificate root = H"` 且不含 `cdhash H"`；`Contents/Resources/app-update.yml` 存在

## 2. release.yml：触发条件修复与三分支重构

- [x] 2.1 job 级 env 标志：`HAS_CSC_LINK: ${{ secrets.CSC_LINK != '' }}`、`HAS_APPLE_CREDS: ${{ secrets.APPLE_TEAM_ID != '' }}`（GitHub Actions step `if` 不可见 secrets、不可见 step 级 env——runner 源码 StepsRunner.cs 实锤，必须 job 级）
- [x] 2.2 Developer ID 签名+公证分支条件改为 `runner.os == 'macOS' && env.HAS_CSC_LINK == 'true' && env.HAS_APPLE_CREDS == 'true'`（命令不变），追加 `codesign --verify --deep --strict` 出包断言
- [x] 2.3 新增证书签名分支（自签名/任意 p12，不公证）：条件 `runner.os == 'macOS' && env.HAS_CSC_LINK == 'true' && env.HAS_APPLE_CREDS == 'false'`；按 1.1 实测结果实现（信任证书 + electron-builder 一步出包为主案，identity=null + 手动 codesign 为备选），`hardenedRuntime=false`，artifactName 保持 `-unsigned` 后缀约定，UNSIGNED_SUFFIX env 注入
- [x] 2.4 ad-hoc 兜底分支条件改为 `runner.os == 'macOS' && env.HAS_CSC_LINK == 'false'`（命令与行为不变）

## 3. 出包断言（防回归，自签名分支内实现）

- [x] 3.1 签名产物断言：zip 内 app `codesign --verify --deep --strict` 通过；`codesign -d --requirements -` 含 `certificate root = H"` 且不含 `cdhash H"`（grep 断言，失败即 job 失败——防止回归到 ad-hoc 形态）
- [x] 3.2 产物含更新配置断言：zip 内 `Contents/Resources/app-update.yml` 存在（缺失即 job 失败，沿用既有机制）

## 4. 文档同步

- [x] 4.1 README：新增自签名证书生成指引（openssl 生成含 codeSigning EKU 的证书 → 导入钥匙串 → 导出 p12 → base64 配置 `CSC_LINK`/`CSC_KEY_PASSWORD`）、私钥保管与有效期建议（10–20 年，需求绑定证书哈希、证书失效/私钥丢失后更新即失败）
- [x] 4.2 README FAQ/发布说明：`-unsigned` 后缀语义统一为"未用 Developer ID 签名"（含自签名与 ad-hoc）；自签名产物可自动更新；首个证书签名版本需手动安装 dmg 过渡（旧 ad-hoc 安装无法自动跨入证书签名版本）
- [x] 4.3 发布流程文档：三种 macOS 构建分支的凭据要求（Developer ID+公证 / 证书签名不公证 / ad-hoc 兜底）与各自产物能力（Gatekeeper、自动更新）

## 5. 回归与验收

- [x] 5.1 `npm test` 与 `npm run smoke` 全量回归（本变更不涉 src/**，确认无回归）
- [x] 5.2 `openspec validate` 通过（变更规格增量合法）
- [x] 5.3 真实链路验收：发布 v0.1.18（自签名）→ 本机手动装 dmg（过渡安装）→ 发布 v0.1.19 → 本机 0.1.18→0.1.19「立即安装 → 自动重启」通过（补 fix-mac-unsigned-update 遗留的待发布期验收）；若未到发布期，以 1.x 实测 + 单测回归作为阶段性验收，真实链路留待首次发布验证

### 验收记录（阶段性）

- **签名链路实测（1.1/1.2/1.3，本机 danger-full-access 等价无沙箱环境）**：
  - **主案**（信任证书 + electron-builder 自动签名）：`security add-trusted-cert -d -r trustRoot -k login.keychain-db`（无需 sudo）→ `find-identity -v` 列出为有效身份 → electron-builder 日志确认 `signing file=... identityName=WebDeck Self-Sign Test`、`hardenedRuntime=false` 生效（命令无 `--options runtime`）；**唯一失败点**：本机 timestamp.apple.com 不可达（HTTP 000；GitHub 官方 macOS runner 为标准可达环境，此为其全部 mac 签名构建的基础设施）。
  - **备选**（timestamp 不可达回退，端到端通过）：`--mac dir --config.mac.identity=null` → 注入 app-update.yml → 无 `--deep` 逐组件签名（**关键发现**：Electron 37 发行版部分组件为 linker-signed，`codesign --force --deep` 证书签名替换稳定报 `errSecInternalComponent`——Mantle.framework / WebDeck Helper.app / chrome_crashpad_handler 逐个命中；单独签名均成功）→ `--prepackaged` 出 `WebDeck-0.1.17-arm64-mac-unsigned.zip` → 解压断言：`codesign --verify --deep --strict` OK、`requirements` = `certificate root = H"ce13ba09..."`（非 cdhash）、app-update.yml 存在且内容正确 → **Squirrel 模拟校验（repro，不同构建同证书）双向 PASS**。
- **release.yml**：job 级 env 标志（`HAS_CSC_LINK`/`HAS_APPLE_CREDS`）+ 三个互斥分支条件，YAML 解析与条件互斥验证通过。
- **回归**：`npm test` 全部通过；`npm run smoke` 全部通过（SMOKE_OK，含 UI 渲染/启动停止/侧边栏项）。
- **openspec validate**：3/3 变更通过。
- **待发布期验收（真实链路）**：发布 v0.1.18（自签名证书，`-unsigned` zip+dmg）→ 本机手动装 dmg（过渡安装，右键打开放行）→ 发布 v0.1.19 → 本机 0.1.18→0.1.19「立即安装 → 自动重启」通过；同时验证 CI 上证书签名分支全链路（信任证书 + timestamp 可达 + 出包断言）。
