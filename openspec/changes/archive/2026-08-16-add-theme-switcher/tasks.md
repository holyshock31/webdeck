# Tasks — add-theme-switcher

- [x] 把 src/renderer/styles.css 的硬编码颜色抽为 CSS 变量（design tokens），保持 dark 主题视觉与现状一致
- [x] 定义 light 主题变量集（侧边栏/内容区/文字/弹窗/状态灯的浅色取值，状态灯需保证对比度）
- [x] 渲染层增加主题状态（当前主题、切换函数），默认 dark，缺失时回退 dark
- [x] 侧边栏工具栏或状态栏增加主题切换入口，点击在 dark / light 间切换并即时生效
- [x] 主题选择持久化：经 preload 桥调用主进程写入 settings.theme（复用 store.updateSettings），启动时读取恢复
- [x] 手动验证：两套主题下侧边栏、添加/编辑弹窗、日志弹窗、状态灯均正常可辨；切换后重启保持所选主题
