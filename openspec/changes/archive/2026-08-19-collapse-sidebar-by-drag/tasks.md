## 1. 渲染层：拖拽阈值区与收起判定

- [x] 1.1 `src/renderer/app.js`：新增常量 `COLLAPSE_DRAG_THRESHOLD = 80`（注释指向规格语义）；`clampSidebarWidth` 增加拖拽模式参数（`allowCollapseZone`，下限放宽为 0），pointermove 使用拖拽模式
- [x] 1.2 `endDrag` 增加收起判定分支：`moved` 为真且释放宽度 < `COLLAPSE_DRAG_THRESHOLD` → 将 `sidebarWidth` 与 CSS 变量恢复为进入阈值区前的合法宽度、`applySidebarCollapsed(true)`、`webdeck.setSidebarCollapsed(true)`，**不调用 setSidebarWidth**；否则走现状路径（180 回弹 + 落盘）
- [x] 1.3 拖拽中记录 `lastValidWidth`（进入阈值区前的宽度，仅记录 ≥180 的值），供收起时恢复

## 2. 主进程：预览钳制放宽

- [x] 2.1 `src/main/index.js`：`ui:sidebar-width-preview` 放宽下限（允许跟到阈值区，min 0），视图拖动中实时跟随无错位；`settings:setSidebarWidth` 保持 180 下限不变（存储路径双保险）
- [x] 2.2 `src/main/store.js`：修复 updateSettings 并发写入竞态（调用时快照 cache 导致连续两次写丢失前一次字段，收起路径稳定触发）——合并改为在写队列执行时进行

## 3. 测试用例

- [x] 3.1 e2e（e2e/run.cjs）新增用例 C「拖拽收起」：拖到 30px 松手 → 断言 `body.sidebar-collapsed` 置位、宽度变量恢复拖前值（非 30px 残留）、展开后宽度恢复拖前值
- [x] 3.2 smoke（src/main/index.js 冒烟段）新增 RS 段断言：合成事件拖到 30px → `settings.sidebarCollapsed === true`、`settings.sidebarWidth` 未被窄宽度污染、展开恢复
- [x] 3.3 本地跑通 `npm run e2e`（默认 + CDP 变体）与 `npm run smoke` 全部通过

## 4. 验证

- [x] 4.1 `npm test` 回归通过
- [x] 4.2 手动验收：拖到边缘松手收起、展开恢复原宽度；拖到 150 松手回弹 180 不收起；纯点击分隔条不触发任何变化
- [x] 4.3 回归确认：常规拖拽（>180 区间）、钳制（180/窗口一半）、收起态无分隔条等既有行为不变
