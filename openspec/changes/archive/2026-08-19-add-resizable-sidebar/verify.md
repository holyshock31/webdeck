# Verification — add-resizable-sidebar

Date: 2026-08-19T12:05:00Z
Change: openspec/changes/add-resizable-sidebar
Model: deepseek-official / deepseek-v4-flash (flash)

**8/8 scenarios passed**

## Scenarios

| # | Result | Requirement | Scenario | Reason |
|---|--------|-------------|----------|--------|
| 1 | ✅ | 侧边栏宽度可调 | 拖动分隔条调整宽度 | 冒烟 SMOKE_RS_DRAG：pointerdown/move/up 序列后 CSS 宽度 320px（拖动中实时跟随）、body.resizing 置位/清除、原生应用视图左缘同步到 x=320 |
| 2 | ✅ | 侧边栏宽度可调 | 宽度边界约束 | 冒烟 SMOKE_RS_CLAMP：拖过窗口一半停在 640px（窗口一半），拖到 180px 以下停在 180px，落盘值一致 |
| 3 | ✅ | 侧边栏宽度可调 | 拖动时禁止文本选中 | pointerdown 给 body 加 `resizing` 类（全局 `cursor: col-resize` + `user-select: none`），pointerup 移除；冒烟验证类置位/清除 |
| 4 | ✅ | 侧边栏宽度可调 | 收起态无分隔条 | 冒烟 SMOKE_RS_COLLAPSE：`body.sidebar-collapsed` 下 `#sidebar-resizer` display:none（与侧边栏同规则），展开后恢复显示 |
| 5 | ✅ | 侧边栏宽度持久化 | 重启后保持宽度 | `settings.sidebarWidth` 经 settings:setSidebarWidth 钳制后随 webdeck.json 原子写入（冒烟后磁盘文件实测含 sidebarWidth:180）；启动时渲染层读取并应用、主进程 boot 恢复 sidebarWidth，缺失回退 252px |
| 6 | ✅ | 侧边栏宽度持久化 | 无配置时默认宽度 | 全新 userData 启动（冒烟前清空）默认宽度 252px（SMOKE_RS_DEFAULT），与引入前行为一致 |
| 7 | ✅ | 侧边栏宽度持久化 | 收起展开不改变宽度 | 冒烟 SMOKE_RS_COLLAPSE：拖到 320px → 收起 → 展开后仍 320px，宽度不被收起/展开重置，视图 x 同步 320 |
| 8 | ✅ | 侧边栏支持收起与展开 | 展开侧边栏恢复原状（持久化宽度） | 展开后以持久化宽度 320px 恢复显示（非固定 252px），选中项与状态灯保留 |

## Raw judge output

```
OK|侧边栏宽度可调: 拖动分隔条调整宽度 — 分隔条 pointer 拖动序列：拖动中 CSS 变量实时变化（320px）、释放后宽度保持，主进程原生视图同步 x=320，落盘 settings.sidebarWidth=320
OK|侧边栏宽度可调: 宽度边界约束 — 拖过窗口一半停 640px、拖到 180px 以下停 180px，钳制前后 CSS 与落盘值一致
OK|侧边栏宽度可调: 拖动时禁止文本选中 — body.resizing 拖动中置位（cursor: col-resize + user-select: none），pointerup/pointercancel 移除
OK|侧边栏宽度可调: 收起态无分隔条 — body.sidebar-collapsed 同时隐藏 #sidebar-resizer，展开后恢复，无分隔条可拖
OK|侧边栏宽度持久化: 重启后保持宽度 — settings.sidebarWidth 原子写入 webdeck.json（磁盘实测），启动渲染层 applySidebarWidth + 主进程 boot 恢复
OK|侧边栏宽度持久化: 无配置时默认宽度 — 全新配置无 sidebarWidth 时回退 252px（冒烟默认断言 252px 通过）
OK|侧边栏宽度持久化: 收起展开不改变宽度 — 320px 收起→展开仍 320px，宽度不被收起/展开重置
OK|侧边栏支持收起与展开: 展开侧边栏恢复原状 — 展开以持久化宽度恢复（SMOKE_RS_COLLAPSE width=320px viewX=320），选中项与状态灯保留
```

## Evidence

- `npm test`：✅ 全部通过（核心逻辑单测回归，含进程/监测/查找/更新状态机）
- `npm run smoke`：SMOKE_OK（exit 0），新增 SMOKE_RS_DEFAULT / SMOKE_RS_DRAG / SMOKE_RS_CLAMP / SMOKE_RS_COLLAPSE 断言全部为 true
- 磁盘持久化：`~/Library/Application Support/WebDeck/webdeck.json` 含 `"sidebarWidth": 180`（冒烟钳制测试落盘值）
- 手动验收清单：`docs/manual-verification-resizable-sidebar.md`
