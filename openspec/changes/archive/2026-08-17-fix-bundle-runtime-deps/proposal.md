# Proposal — fix-bundle-runtime-deps

## Why

v0.1.8 发布后 Windows 安装版启动即崩溃：

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'electron-updater' imported from
...\resources\app.asar\src\...\updater.js
```

根因（已通过 asar 检查确认）：项目**没有 `dependencies`**（electron / electron-builder / electron-updater 全部在 `devDependencies`），而 electron-builder 只把**生产依赖**打包进 asar——`build.files` 限定的 `src/**`、`assets/**`、`package.json` 不含任何 node_modules。此前 WebDeck 代码只使用 `node:` 内置模块，从未依赖外部运行时包，因此一直未暴露；`add-update-check` 引入 `electron-updater`（运行时依赖）后，打包产物缺包必然崩溃。

## What Changes

- `package.json`：把 `electron-updater` 从 devDependencies **移入 dependencies**（运行时依赖随 asar 打包，electron-builder 会自动包含其传递依赖如 builder-util-runtime、fs-extra、semver 等）；`electron` 与 `electron-builder` 保持 devDependencies（构建工具不进包）
- 验证：本地 `electron-builder --dir` 后检查 `app.asar` 含 `node_modules/electron-updater`；打包产物 smoke 回归（启动不再崩溃、更新服务初始化正常）

## Impact

- **打包产物**：asar 增加 electron-updater 及其依赖（体积增大约 1–2MB）；安装包内应用可正常加载更新服务
- **运行时**：仅依赖分类变化，代码零改动；开发态（electron .）行为不变
- **兼容性**：无 schema/IPC/UI 变化；发布产物需重新构建（v0.1.9）
- **风险**：低——electron-builder 对 dependencies 的自动打包是标准行为；后续新增运行时依赖须放 dependencies（在 README/AGENTS 提示）
- **范围边界**：不做依赖瘦身/手动 files 白名单；验收方式为打包产物启动验证（手动验证）

## Verification

以下命令由 verify 阶段自动执行，输出纳入逐 Scenario 判定：

```bash
npm test
npm run smoke
```
