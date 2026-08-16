# Tasks — set-app-name

- [x] 主进程启动时声明应用身份：app.setName('WebDeck') 与 app.setAppUserModelId('com.webdeck.WebDeck')（src/main/index.js 顶部）
- [x] 编写 scripts/dev-mac.sh：macOS 下将 Electron.app 复制为 dist/WebDeck.app，改写 CFBundleName / CFBundleDisplayName / CFBundleIdentifier / CFBundleExecutable，并把可执行文件改名为 WebDeck
- [x] dev-mac.sh 通过版本标记在 Electron 版本变化时自动重建副本（副本存在且版本一致则直接复用）
- [x] dev-mac.sh 非 macOS 平台回退直接 exec electron .
- [x] package.json 的 start 脚本改为 bash scripts/dev-mac.sh
- [x] 核对讨论阶段已落下的部分代码（index.js 身份声明、dev-mac.sh、start 脚本），与提案一致并补完验证
- [x] 手动验证：macOS npm start 后 Dock 悬停与 ⌘Tab 显示 WebDeck；Windows 任务栏 hover 与通知归属显示 WebDeck；非 macOS 回退启动正常；npm test 与 npm run smoke 无回归
