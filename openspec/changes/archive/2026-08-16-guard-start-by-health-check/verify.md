# Verification — guard-start-by-health-check

Date: 2026-08-16T19:32:04.000Z
Change: openspec/changes/guard-start-by-health-check
Model: deepseek-official / deepseek-v4-flash (flash)

**7/7 scenarios passed**

## Scenarios

| # | Result | Requirement | Scenario | Reason |
|---|--------|-------------|----------|--------|
| 1 | ✅ | 通过 URL 添加应用并配置启动方式 | 添加仅打开 URL 的应用 | 未改动场景，normalizeApp 逻辑不变，测试 5 覆盖 URL 规范化 |
| 2 | ✅ | 通过 URL 添加应用并配置启动方式 | 使用 Shell 命令拉起本地服务 | smoke SMOKE_LAUNCH=running：切换标签时健康未通过 → 自动拉起 → 健康通过后 running |
| 3 | ✅ | 通过 URL 添加应用并配置启动方式 | 服务已在外部启动时不重复拉起 | smoke 第 8 步：外部 demo 服务先启动，startApp 返回 skipped=true、procs 无新进程、状态 running |
| 4 | ✅ | 通过 URL 添加应用并配置启动方式 | 配置校验失败给出错误 | 未改动场景，normalizeApp 校验逻辑不变，测试 5 覆盖 |
| 5 | ✅ | 运行状态可视化与操作 | 状态灯随监测结果实时变化 | 状态机未改动，测试 1/3 覆盖 starting → running / error 流转 |
| 6 | ✅ | 运行状态可视化与操作 | 工具栏操作 | 未改动场景，smoke SMOKE_STOP=stopped 覆盖停止后状态变灰 |
| 7 | ✅ | 运行状态可视化与操作 | 手动启动已外部运行的服务被跳过 | app:start 守卫 `isHealthy` 通过 → 不 spawn 并置 running；测试 8 覆盖 isHealthy 四类断言，smoke 第 8 步端到端验证 |

## Raw judge output

```
OK|通过 URL 添加应用并配置启动方式: 添加仅打开 URL 的应用 — 未改动场景，normalizeApp 逻辑不变，测试 5 覆盖 URL 规范化
OK|通过 URL 添加应用并配置启动方式: 使用 Shell 命令拉起本地服务 — smoke SMOKE_LAUNCH=running：切换标签时健康未通过 → 自动拉起 → 健康通过后 running
OK|通过 URL 添加应用并配置启动方式: 服务已在外部启动时不重复拉起 — smoke 第 8 步：外部 demo 服务先启动，startApp 返回 skipped=true、procs 无新进程、状态 running
OK|通过 URL 添加应用并配置启动方式: 配置校验失败给出错误 — 未改动场景，normalizeApp 校验逻辑不变，测试 5 覆盖
OK|运行状态可视化与操作: 状态灯随监测结果实时变化 — 状态机未改动，测试 1/3 覆盖 starting → running / error 流转
OK|运行状态可视化与操作: 工具栏操作 — 未改动场景，smoke SMOKE_STOP=stopped 覆盖停止后状态变灰
OK|运行状态可视化与操作: 手动启动已外部运行的服务被跳过 — app:start 守卫 isHealthy 通过 → 不 spawn 并置 running；测试 8 覆盖 isHealthy 四类断言，smoke 第 8 步端到端验证
```
