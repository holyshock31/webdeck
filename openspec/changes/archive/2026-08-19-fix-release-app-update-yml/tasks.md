## 1. 本地验证注入方案（先于改工作流）

- [x] 1.1 用现有 dist/mac-arm64/WebDeck.app（本机 `--mac dir` 产物）复现两种注入顺序并验证签名：a) codesign → 注入 app-update.yml → `codesign --verify --deep --strict`；b) 注入 → codesign → verify。确认哪种顺序产物签名校验通过（决定 release.yml 中注入步骤的位置）
- [x] 1.2 确认注入后的 .app 经 `--prepackaged` 出 zip 后，zip 内 `Contents/Resources/app-update.yml` 存在且内容正确（owner/repo/provider/updaterCacheDirName）

## 2. release.yml 修改

- [x] 2.1 macOS unsigned 分支：在确定的顺序位置插入 app-update.yml 写入步骤（内容与 electron-builder 生成一致：`owner: holyshock31` / `repo: webdeck` / `provider: github` / `updaterCacheDirName: webdeck-updater`）
- [x] 2.2 同一分支 dmg/zip 构建后新增断言步骤：`unzip -l` 检查产物 zip 含 `Contents/Resources/app-update.yml`，缺失即 exit 1（job 失败，release 保持 draft）

## 3. 验证

- [x] 3.1 本地按 release.yml 新流程完整走一遍 unsigned 分支（dir → [注入] → codesign → verify → prepackaged → 断言），产物 zip 内含 app-update.yml 且 codesign 校验通过
- [x] 3.2 回归确认：签名分支（CSC_LINK 场景）与 Windows/Linux 分支不受影响（仅读工作流差异确认）
- [x] 3.3 更新 v0.1.15 已装客户端验证路径说明：修复对下次 tag（v0.1.16）生效
