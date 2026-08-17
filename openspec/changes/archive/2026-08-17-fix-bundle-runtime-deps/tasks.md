# Tasks — fix-bundle-runtime-deps

- [x] package.json：electron-updater 从 devDependencies 移入 dependencies（npm install electron-updater --save 或手改后 npm install 同步 lock）
- [x] 本地验证：`npx electron-builder --dir` 构建后 `npx asar list` 确认 app.asar 含 `node_modules/electron-updater` 及其传递依赖
- [x] 打包产物 smoke：`--smoke --no-sandbox` 跑通（启动不崩溃、更新服务初始化正常）
- [x] 回归：npm test 与 npm run smoke 全绿；README 常见问题 + AGENTS.md 工程约定记录"运行时依赖须放 dependencies"
- [x] 真机验证：清单文档化于 docs/windows-manual-verification.md（v0.1.9 安装版启动正常、检查入口可用、asar 抽查）；真机执行留待验收
