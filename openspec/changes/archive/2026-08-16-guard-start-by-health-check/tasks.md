# Tasks — guard-start-by-health-check

- [x] monitor.js 新增 isHealthy 启动前守卫：单次探测（检查 URL / 期望状态码 / 超时），监测未启用返回 false
- [x] 自动启动（activateApp）：拉起前先探测，健康通过则不 spawn 并标记 running
- [x] 手动启动（app:start）：拉起前先探测，健康通过返回 skipped 不 spawn
- [x] test-core.js 新增测试 8：isHealthy 通过 / 失败 / 监测未启用 / 状态码不匹配 四类断言
- [x] smoke 新增第 8 步：外部已启动服务 → skipped=true、无 WebDeck 拉起进程、状态 running
- [x] 回归验证：npm test 与 npm run smoke 全部通过，无残留进程与应用数据
