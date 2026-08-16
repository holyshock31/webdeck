# Verification — add-manual-start-stop

Date: 2026-08-16T19:29:51.240Z
Change: openspec/changes/add-manual-start-stop
Model: deepseek-official / deepseek-v4-flash (flash)

**8/8 scenarios passed**

## Scenarios

| # | Result | Requirement | Scenario | Reason |
|---|--------|-------------|----------|--------|
| 1 | ✅ | 侧边栏应用项提供手动启动/停止控制 | 不切换标签直接启动未激活应用的本地服务 | 渲染层 ctl 按钮调用 toggleAppProc，不触发 activate，smoke 测试验证未激活应用启动不切换标签 |
| 2 | ✅ | 侧边栏应用项提供手动启动/停止控制 | 停止未激活应用的本地服务 | ctl 按钮 stopPropagation 防止切换，stopApp 仅停止进程，activeId 不变 |
| 3 | ✅ | 侧边栏应用项提供手动启动/停止控制 | 无启动配置的应用按钮禁用 | updateAppCtl 对 mode none 应用设置 disabled=true 并 title 提示「该应用未配置本地启动」，smoke 测试验证 ctlNoneDisabled |
| 4 | ✅ | 手动启动/停止的幂等与可重试语义 | 重复点击启动不产生重复进程 | process-manager launch 检查已有运行进程返回同一实例，不重复 spawn |
| 5 | ✅ | 手动启动/停止的幂等与可重试语义 | 对未运行的应用点击停止无副作用 | process-manager stop 对无进程返回 false，主进程只设置 stopped 状态 |
| 6 | ✅ | 手动启动/停止的幂等与可重试语义 | 启动失败后可重新手动启动 | process-manager 保留 spawnError tombstone，再 launch 检查 spawnError 后可替换新进程，测试 7 验证重试成功 |
| 7 | ✅ | 手动控制状态实时反馈 | 按钮随状态推送自动切换 | renderList 和 updateAppCtl 根据 statusOf 显示 ▶/⏹，onStatus 推送更新 updateDot 调用 updateAppCtl |
| 8 | ✅ | 手动控制状态实时反馈 | 列表按钮与工具栏动作一致 | 两者都基于相同 statusOf 逻辑，updateToolbar 和 updateAppCtl 分别独立处理选中/未选中应用 |

## Raw judge output

```
OK|侧边栏应用项提供手动启动/停止控制: 不切换标签直接启动未激活应用的本地服务 — 渲染层 ctl 按钮调用 toggleAppProc，不触发 activate，smoke 测试验证未激活应用启动不切换标签
OK|侧边栏应用项提供手动启动/停止控制: 停止未激活应用的本地服务 — ctl 按钮 stopPropagation 防止切换，stopApp 仅停止进程，activeId 不变
OK|侧边栏应用项提供手动启动/停止控制: 无启动配置的应用按钮禁用 — updateAppCtl 对 mode none 应用设置 disabled=true 并 title 提示「该应用未配置本地启动」，smoke 测试验证 ctlNoneDisabled
OK|手动启动/停止的幂等与可重试语义: 重复点击启动不产生重复进程 — process-manager launch 检查已有运行进程返回同一实例，不重复 spawn
OK|手动启动/停止的幂等与可重试语义: 对未运行的应用点击停止无副作用 — process-manager stop 对无进程返回 false，主进程只设置 stopped 状态
OK|手动启动/停止的幂等与可重试语义: 启动失败后可重新手动启动 — process-manager 保留 spawnError tombstone，再 launch 检查 spawnError 后可替换新进程，测试 7 验证重试成功
OK|手动控制状态实时反馈: 按钮随状态推送自动切换 — renderList 和 updateAppCtl 根据 statusOf 显示 ▶/⏹，onStatus 推送更新 updateDot 调用 updateAppCtl
OK|手动控制状态实时反馈: 列表按钮与工具栏动作一致 — 两者都基于相同 statusOf 逻辑，updateToolbar 和 updateAppCtl 分别独立处理选中/未选中应用
```
