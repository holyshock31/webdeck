# Tasks — add-app-icons

- [x] 应用配置规范化支持 icon 字段（src/main/apps.js normalizeApp 增加可选 icon，默认空字符串）
- [x] 添加/编辑弹窗增加图标设置项（内置图标下拉 + 本地路径/URL 输入，图标来源提示）
- [x] 渲染层列表项支持图标渲染：有 icon 显示图片（圆角裁切），加载失败回退首字母色块
- [x] 内置图标素材入库与引用（assets/icons/dsh.png 等，编辑弹窗图标选择项列出）
- [x] 持久化验证：icon 随应用配置写入 webdeck.json，重启后保持
- [x] 手动验证：设置图标后列表显示、未设置回退色块、图标加载失败不破版
