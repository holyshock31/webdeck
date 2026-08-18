# Verification — fix-update-metadata

Date: 2026-08-18T01:11:17.483Z
Change: openspec/changes/fix-update-metadata
Model: deepseek-official / deepseek-v4-flash (flash)

**2/2 scenarios passed**

## Scenarios

| # | Result | Requirement | Scenario | Reason |
|---|--------|-------------|----------|--------|
| 1 | ✅ | 更新元数据与实际资产一致 | 客户端按元数据下载成功 | release.yml 使用 electron-builder 的 artifactName 配置在构建时生成元数据和文件名，且上传 dist/*.dmg, dist/*.zip, dist/latest*.yml，确保一致性。 |
| 2 | ✅ | 更新元数据与实际资产一致 | 未签名产物命名一致 | release.yml 的 macOS 未签名分支使用 `--config.mac.artifactName=WebDeck-\${version}-\${arch}-mac\${env.UNSIGNED_SUFFIX}.\${ext}` 和 `UNSIGNED_SUFFIX: '-unsigned'`，在构建时生成 `-unsigned` 后缀，与元数据一致。 |

## Raw judge output

```
OK|更新元数据与实际资产一致: 客户端按元数据下载成功 — release.yml 使用 electron-builder 的 artifactName 配置在构建时生成元数据和文件名，且上传 dist/*.dmg, dist/*.zip, dist/latest*.yml，确保一致性。
OK|更新元数据与实际资产一致: 未签名产物命名一致 — release.yml 的 macOS 未签名分支使用 `--config.mac.artifactName=WebDeck-\${version}-\${arch}-mac\${env.UNSIGNED_SUFFIX}.\${ext}` 和 `UNSIGNED_SUFFIX: '-unsigned'`，在构建时生成 `-unsigned` 后缀，与元数据一致。
```
