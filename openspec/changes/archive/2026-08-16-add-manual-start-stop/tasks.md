# Tasks — add-manual-start-stop

- [x] 核对主进程 app:start / app:stop：已运行的进程再次 start 不重复拉起（幂等）、未运行的进程 stop 为无害 no-op，必要时补强
- [x] 渲染层：侧边栏每个应用项渲染独立的 ▶/⏹ 启动/停止按钮，点击只作用于该应用且不切换当前标签（stopPropagation）
- [x] 渲染层：launch.mode 为 none 的应用按钮禁用并悬停提示原因（修复空命令 spawn 报错）
- [x] 渲染层：按钮图标与标题随 apps:status 推送实时切换（▶ ↔ ⏹），与工具栏 tb-toggle 状态保持一致
- [x] 渲染层：手动启动/停止失败时给出可见反馈（alert 或状态详情），应用状态保持正确
- [x] scripts/test-core.js：补充幂等单测（重复 launch 返回同一实例、stop 未运行返回 false、退出回调只触发一次）
- [x] npm run smoke：扩展手动启动/停止场景（对未激活应用 start → running、stop → stopped）
- [x] 手动验证：添加 Shell 启动应用后不切换标签直接点 ▶ 启动、⏹ 停止；重复点击不产生重复进程；无启动配置应用按钮禁用；npm test 与 npm run smoke 无回归
