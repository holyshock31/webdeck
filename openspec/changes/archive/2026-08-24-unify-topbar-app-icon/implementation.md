# Implementation — unify-topbar-app-icon

## 变更摘要

将侧边栏左上角品牌标识从 10×10 渐变色块（`.brand-dot`）替换为与任务栏 / Dock 一致的应用图标（`assets/icon.png` 同设计），保留「WebDeck」名称文字。

## 改动清单

| 任务 | 文件 | 说明 |
|---|---|---|
| 1.1 资源 | `src/renderer/icons/webdeck.png`（新增） | `assets/icon.png`（1024×1024）降采样为 128×128 PNG（约 29KB），与 `icons/dsh.png` 同目录约定，满足 CSP `img-src 'self'` |
| 2.1 渲染层 | `src/renderer/index.html` | `.brand-dot` 色块替换为 `<img class="brand-icon" src="icons/webdeck.png" alt="WebDeck" />`，`brand-name`「WebDeck」文字保留 |
| 2.2 样式 | `src/renderer/styles.css` | 新增 `.brand-icon`（22px 见方、圆角 5px、`object-fit: contain`）；删除 `.brand-dot` 规则 |

## 验证

- `npm run smoke`：通过（`SMOKE_OK`，启动 / 渲染 / 启停控制 / 侧边栏宽度调整与收起等全链路无回归）。
- 深浅主题可辨性：`.brand-icon` 使用应用图标原图（自带白底圆角），两种主题下背景均不会与图标混淆；样式不依赖主题变量，无需按主题分支。

## 说明

- 未改动任务栏 / Dock / 窗口图标、打包配置、主进程与 preload。
- `--brand-grad-end` 主题变量保留（tasks.md 仅要求删除 `.brand-dot` 规则，未涉及变量）。
