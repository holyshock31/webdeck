# Verify — collapse-sidebar-by-drag（补录验收记录）

> 本变更实现期间归档（2026-08-19），归档时未生成 verify.md。以下为归档后补录的验收记录，覆盖 tasks.md 全部 11 项任务的完成证据。

## 验收结论：通过 ✅

## 验证证据（2026-08-19，隔离 userData + --no-sandbox）

| 验证项 | 结果 |
|---|---|
| `npm test`（scripts/test-core.js 全部测试组） | ✅ 全部通过 |
| `npm run smoke`（--user-data-dir 隔离） | ✅ `SMOKE_OK`（SMOKE_RS_DEFAULT / DRAG / CLAMP / COLLAPSE / COLLAPSE_DRAG 全 ok） |
| `node e2e/run.cjs --no-sandbox` | ✅ `E2E_OK` 4/4（拖拽调整宽度、边界钳制、阈值区回弹、拖拽收起） |
| 拖拽收起行为（自动化诊断脚本复刻 smoke 9.1–9.5 序列） | ✅ 拖入阈值区（<80px）松手 → 收起态（sidebarCollapsed=true）；`settings.sidebarWidth` 保持拖前值 320（窄宽度不污染）；展开恢复 320 |

## 规格场景对照（delta spec 场景逐项）

- ✅ 拖拽到左缘收起：诊断脚本 9.5 步骤验证（拖到 30px 松手 → 收起，与按钮/⌘\ 等效）
- ✅ 拖拽收起不污染宽度：收起后 storedW=320（拖前值），非 30px 残留；展开恢复 320
- ✅ 宽度边界约束（回弹）：smoke SMOKE_RS_CLAMP ok=true（阈值区外 120px 松手 → 回弹 180 落盘）
- ✅ 拖动时禁止文本选中 / 收起态无分隔条：smoke SMOKE_RS_COLLAPSE ok=true（收起态 resizer display:none，展开恢复）

## 遗留说明（不影响本变更验收，已另行跟踪）

- `ui:sidebar-resizing` 曾调用 `view.setIgnoreMouseEvents`（Electron 37 WebContentsView 无此 API）——真实鼠标拖动穿透失效风险，已由后续变更 `fix-drag-mouse-passthrough` 修复（拖动期间隐藏应用视图实现穿透），修复后 smoke 不再报 TypeError
- 实现代码与 e2e 用例在本验收时位于工作区未提交状态，提交分组见仓库提交计划
