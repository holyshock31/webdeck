## 1. 资源

- [ ] 1.1 `sips -Z 128` 将 `assets/icon.png` 降采样为 `src/renderer/icons/webdeck.png`（渲染层可加载路径，满足 CSP `img-src 'self'`）

## 2. 渲染层

- [ ] 2.1 `src/renderer/index.html`：`.brand-dot` 色块替换为 `<img class="brand-icon" src="icons/webdeck.png" alt="WebDeck" />`，保留「WebDeck」文字
- [ ] 2.2 `src/renderer/styles.css`：新增 `.brand-icon`（约 22px、圆角 5px、object-fit: contain）；删除 `.brand-dot` 规则

## 3. 验证

- [ ] 3.1 `npm run smoke` 全链路通过（无回归）
- [ ] 3.2 深/浅主题下目视检查：左上角显示与任务栏一致的应用图标，清晰可辨
