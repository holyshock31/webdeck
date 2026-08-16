# Project Context

## Purpose

WebDeck（网页甲板）是一个通用桌面网页包装器：通过 URL 添加应用，每个应用可配置**启动方式**（自动拉起本地服务）与**健康监测**（状态灯）。侧边栏标签页形态，macOS 优先，Electron 实现。目标是把「本地服务 + 网页界面」组合成桌面应用体验，内置 DeepSeek Harness、本地静态服务等快捷预设。

## Tech Stack

- 运行时：Node.js / Electron 37
- 语言：原生 JavaScript（ESM），无构建链
- 关键框架：Electron（WebContentsView / contextBridge / IPC）、原生 DOM 渲染层
- 测试：核心逻辑单测（scripts/test-core.js）+ 全链路冒烟测试（npm run smoke）

## Conventions

- 主进程模块（src/main/）保持纯 Node 可单测（不依赖 Electron）；UI 经 preload contextBridge 白名单 API 通信
- 渲染层为原生 JS，无框架、无构建步骤；样式集中在 styles.css
- 持久化：userData/webdeck.json 原子写入（临时文件 + rename）
- 每个应用独立 session 分区（persist:webdeck-<id>），登录态互不串扰且重启保留
- 安全：远程页面 sandbox + contextIsolation，权限按白名单放行，window.open 一律转系统浏览器
- 本地进程以 detached 进程组启动，停止时 SIGTERM 整组、2 秒后 SIGKILL，不遗留子进程
- 测试命令：npm test（核心逻辑）、npm run smoke（全链路冒烟）
