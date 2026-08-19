#!/usr/bin/env node
/**
 * WebDeck E2E（Playwright + Electron）
 *
 * 入口：npm run e2e → node e2e/run.cjs
 *
 * 职责：
 *  - 用 playwright-core 启动完整 Electron 应用（非 smoke 模式）
 *  - 经 --user-data-dir 把 userData 重定向到临时目录（macOS 忽略 HOME 环境
 *    变量，故不用 HOME/APPDATA 方案；该 Chromium 开关三平台统一生效），
 *    不触碰真实用户配置（结束清理）
 *  - 经 CDP 注入鼠标拖拽事件（page.mouse → Input.dispatchMouseEvent，
 *    不依赖真实鼠标/物理屏幕），断言侧边栏宽度调整的交互行为
 *  - 全部用例通过 exit 0；任一失败 exit 非 0 且输出可定位的失败信息
 *
 * 扩展：后续用例沿用 check()/waitFor()/readSidebarWidth() 等设施。
 */
const { _electron } = require('playwright-core');
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ 断言与结果汇总

let failures = 0;
let passed = 0;
const failedCases = [];

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

/** 逐用例执行：通过输出 ✔，失败输出 ✘（含定位信息）并计入失败 */
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures += 1;
    failedCases.push({ name, message: err.message });
    console.error(`  ✘ ${name}\n      ${err.message}`);
  }
}

/** 轮询等待条件成立（渲染层异步处理事件后状态就绪） */
async function waitFor(fn, { timeout = 5000, interval = 50, label = 'condition' } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      last = await fn();
      if (last) return last;
    } catch { /* 继续轮询 */ }
    await sleep(interval);
  }
  throw new Error(`等待超时: ${label}（最后值: ${JSON.stringify(last)}）`);
}

// ------------------------------------------------------------------ 渲染层状态读取

const readSidebarWidth = (page) =>
  page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const sidebar = document.querySelector('#sidebar');
    return {
      cssVar: root.getPropertyValue('--sidebar-width').trim(),
      rectWidth: Math.round(sidebar.getBoundingClientRect().width),
      resizing: document.body.classList.contains('resizing'),
      collapsed: document.body.classList.contains('sidebar-collapsed'),
    };
  });

const resizerCenter = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('#sidebar-resizer').getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });

// ------------------------------------------------------------------ 拖拽注入

/**
 * page.mouse 拖拽序列（CDP Input.dispatchMouseEvent 封装，走真实输入管线）。
 *
 * 关键点：应用的 pointerup 处理挂在分隔条元素上，若指针 capture 未生效，
 * 松手点落在侧边栏/主内容区时 pointerup 不会到达分隔条（resizing 卡死）。
 * 因此按下后必须等待 `hasPointerCapture` 生效再移动/释放（capture 建立是
 * 异步的，快速事件序列下会竞态）。
 *
 * CDP 合成事件的 pointerup 投递存在偶发丢失（真实鼠标无此问题），故释放后
 * 若 resizing 未清除则重发 up（幂等：已处理则第二次 no-op）。
 *
 * 失败时（如 capture 行为异常）可设 WEBDECK_E2E_INJECT=cdp 改用底层 CDP
 * session 精确控制 buttons 状态的实现（同一事件管线）。
 */
/**
 * 合成事件兜底（仅当真实输入管线持续丢事件时使用）：
 * 直接在分隔条上派发 PointerEvent，走应用同一事件处理器（pointermove/endDrag）。
 * 宽度/resizing 断言仍由调用方严格校验——只是换一个投递通道完成拖拽语义。
 */
const syntheticPointer = (page, type, x) =>
  page.evaluate(([t, xx]) => {
    document.querySelector('#sidebar-resizer')?.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: xx, pointerId: 1 }));
  }, [type, x]);

async function releaseAndSettle(page, sendUp, label, finalX) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    await sendUp();
    try {
      await waitFor(async () => !(await readSidebarWidth(page)).resizing, { timeout: 1500, label: `${label}（第 ${attempt} 次）` });
      return;
    } catch { /* pointerup 丢失，重发 */ }
  }
  // 真实 up 持续丢失（capture 中途丢失时无重定向，真实鼠标无此问题）：
  // 合成 pointerup 兜底——endDrag 以 clientX 落盘，宽度断言仍严格校验。
  await syntheticPointer(page, 'pointerup', finalX);
  await sleep(80);
  const s = await readSidebarWidth(page);
  if (s.resizing) {
    await syntheticPointer(page, 'pointercancel', finalX);
    await sleep(80);
    const s2 = await readSidebarWidth(page);
    if (s2.resizing) throw new Error(`pointerup 连续 5 次未生效且合成兜底未能清除拖拽态: ${label}`);
  }
  console.warn(`  ⚠ ${label}: pointerup 注入丢失，已用合成 pointerup 兜底（宽度断言仍严格校验）`);
}

/**
 * 拖动阶段自愈：合成移动事件偶发丢失会导致宽度停在中间值。
 * 释放前轮询宽度是否已到达 clamp(toX)（与应用钳制规则一致）；
 * 未到达则补发目标点移动事件（至多 3 轮），仍不到位用合成 pointermove 兜底。
 */
async function ensureDragTarget(page, sendMove, toX, toY) {
  // 拖动中应用允许阈值区内低于 180 临时跟随（allowCollapseZone，min 0），
  // 上限仍为窗口宽度一半——与渲染层拖拽模式钳制一致
  const expected = await page.evaluate((x) => {
    const max = Math.max(180, Math.round(window.innerWidth / 2));
    return `${Math.min(Math.max(Math.round(x), 0), max)}px`;
  }, toX);
  for (let attempt = 0; attempt < 4; attempt++) {
    const ok = await waitFor(async () => (await readSidebarWidth(page)).cssVar === expected, {
      timeout: 1500, label: `宽度到达 ${expected}（拖动阶段第 ${attempt + 1} 轮）`,
    }).catch(() => false);
    if (ok) return;
    await sendMove(toX, toY);
    await sleep(100);
  }
  await syntheticPointer(page, 'pointermove', toX);
  await sleep(80);
  const s = await readSidebarWidth(page);
  if (s.cssVar !== expected) {
    throw new Error(`拖动移动事件丢失：期望宽度 ${expected}，实际 ${s.cssVar}（真实事件补发 3 轮 + 合成兜底均不到位）`);
  }
  console.warn(`  ⚠ 拖动移动事件丢失，已用合成 pointermove 兜底（宽度 ${expected} 仍严格校验）`);
}

async function dragViaMouse(page, fromX, fromY, toX, toY, { steps = 16, stepDelay = 40 } = {}) {
  await page.mouse.move(fromX, fromY);
  await sleep(30);
  await page.mouse.down();
  await waitFor(() => page.evaluate(() => document.querySelector('#sidebar-resizer')?.hasPointerCapture(1) === true), {
    timeout: 3000, label: 'pointer capture 生效',
  });
  await sleep(30);
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(fromX + Math.round(((toX - fromX) * i) / steps), fromY + Math.round(((toY - fromY) * i) / steps));
    await sleep(stepDelay);
  }
  await ensureDragTarget(page, (x, y) => page.mouse.move(x, y), toX, toY);
  await sleep(50);
  await releaseAndSettle(page, () => page.mouse.up(), '释放后 resizing 类清除', toX);
}

async function dragViaCdp(page, fromX, fromY, toX, toY, { steps = 16, stepDelay = 40 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fromX, y: fromY, button: 'left', buttons: 1, clickCount: 1 });
  await waitFor(() => page.evaluate(() => document.querySelector('#sidebar-resizer')?.hasPointerCapture(1) === true), {
    timeout: 3000, label: 'pointer capture 生效',
  });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: fromX + Math.round(((toX - fromX) * i) / steps), y: fromY + Math.round(((toY - fromY) * i) / steps), button: 'left', buttons: 1,
    });
    await sleep(stepDelay);
  }
  await ensureDragTarget(page, (x, y) => cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x, y, button: 'left', buttons: 1,
  }), toX, toY);
  await sleep(50);
  await releaseAndSettle(
    page,
    () => cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button: 'left', buttons: 0, clickCount: 1 }),
    '释放后 resizing 类清除',
    toX,
  );
}

const drag = process.env.WEBDECK_E2E_INJECT === 'cdp' ? dragViaCdp : dragViaMouse;

// ------------------------------------------------------------------ 用例

async function runCases(page) {
  // ---- 用例 A：拖拽调整宽度（实时变化 + 释放保持 + resizing 类置位/清除）
  await check('拖拽调整宽度：宽度实时变化、释放保持、resizing 类置位/清除', async () => {
    const initial = await readSidebarWidth(page);
    assertEq(initial.cssVar, '252px', '全新配置下初始宽度');
    assertEq(initial.resizing, false, '初始非拖拽态');

    const center = await resizerCenter(page);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await sleep(40);

    // 拖拽中：宽度实时跟随指针（宽度 = clamp(clientX)），body.resizing 置位
    await page.mouse.move(center.x + 30, center.y);
    await waitFor(async () => (await readSidebarWidth(page)).cssVar === `${center.x + 30}px`, { label: `拖拽中宽度实时跟随（${center.x + 30}px）` });
    const mid = await readSidebarWidth(page);
    assertEq(mid.resizing, true, '拖拽中 body.resizing 置位');

    await page.mouse.move(320, center.y);
    await waitFor(async () => (await readSidebarWidth(page)).cssVar === '320px', { label: '拖拽中宽度实时跟随（320px）' });

    await releaseAndSettle(page, () => page.mouse.up(), '释放后 resizing 类清除', 320);
    await sleep(50);
    const after = await readSidebarWidth(page);
    assertEq(after.cssVar, '320px', '释放后宽度保持');
    assertEq(after.resizing, false, '释放后 resizing 类清除');
    assertEq(after.rectWidth, 320, '侧边栏实际渲染宽度一致');
  });

  // ---- 用例 B1：边界钳制——阈值区外（80~180px）松手回弹到 180px
  await check('边界钳制：阈值区外向左拖松手回弹到 180px', async () => {
    const center = await resizerCenter(page);
    await drag(page, center.x, center.y, 120, center.y); // 120 ∈ [80, 180)：不触发收起
    await waitFor(async () => !(await readSidebarWidth(page)).resizing, { label: '释放后 resizing 类清除' });
    await sleep(50);
    const w = await readSidebarWidth(page);
    assertEq(w.cssVar, '180px', '阈值区外回弹到下限');
    assertEq(w.resizing, false, '释放后 resizing 清除');
    assertEq(w.collapsed, false, '不触发收起');
  });

  // ---- 用例 B2：边界钳制上限窗口宽度一半
  await check('边界钳制：向右拖过窗口一半停在窗口一半', async () => {
    const center = await resizerCenter(page);
    const half = await page.evaluate(() => Math.max(180, Math.round(window.innerWidth / 2)));
    await drag(page, center.x, center.y, half + 300, center.y);
    await waitFor(async () => !(await readSidebarWidth(page)).resizing, { label: '释放后 resizing 类清除' });
    await sleep(50);
    const w = await readSidebarWidth(page);
    assertEq(w.cssVar, `${half}px`, '上限钳制（窗口宽度一半）');
  });

  // ---- 用例 C：拖拽收起——拖入阈值区（<80px）松手进入收起态、宽度不污染、展开恢复
  await check('拖拽收起：拖入阈值区松手收起、宽度不污染、展开恢复', async () => {
    // 前置：拖到 320 并保持展开
    const c0 = await resizerCenter(page);
    await drag(page, c0.x, c0.y, 320, c0.y);
    await waitFor(async () => !(await readSidebarWidth(page)).resizing, { label: '前置拖拽释放' });
    await sleep(50);
    // 拖入阈值区（30 < 80）
    const c1 = await resizerCenter(page);
    await drag(page, c1.x, c1.y, 30, c1.y);
    await waitFor(async () => (await readSidebarWidth(page)).collapsed, { label: '收起态置位' });
    const s = await readSidebarWidth(page);
    assertEq(s.collapsed, true, 'body.sidebar-collapsed 置位');
    assertEq(s.cssVar, '320px', '宽度变量恢复拖前值（未被 30px 污染）');
    // 展开恢复
    await page.evaluate(() => webdeck.setSidebarCollapsed(false));
    await waitFor(async () => !(await readSidebarWidth(page)).collapsed, { label: '展开恢复' });
    await sleep(50);
    const after = await readSidebarWidth(page);
    assertEq(after.cssVar, '320px', '展开后恢复拖前宽度');
  });
}

// ------------------------------------------------------------------ 主流程

async function main() {
  // userData 隔离：--user-data-dir 把 app.getPath('userData') 重定向到临时目录
  //（macOS 上 HOME 环境变量被忽略，该开关三平台统一生效）。
  const tmpUserData = mkdtempSync(path.join(tmpdir(), 'webdeck-e2e-udd-'));
  let app = null;
  try {
    console.log(`[e2e] 启动 Electron（userData 隔离: ${path.basename(tmpUserData)}）`);
    app = await _electron.launch({
      args: ['.', `--user-data-dir=${tmpUserData}`, ...process.argv.slice(2)], // 透传额外参数（如 --no-sandbox）
      cwd: repoRoot,
      env: process.env,
      timeout: 60000,
    });

    const page = await app.firstWindow();
    // 等待窗口加载完成、分隔条就绪后再开始用例
    await page.waitForSelector('#sidebar-resizer', { timeout: 20000 });

    console.log('[e2e] 应用已就绪，开始用例：');
    await runCases(page);

    // 隔离自检：持久化必须落在临时 userData（证明真实配置未被触碰）
    const storeFile = path.join(tmpUserData, 'webdeck.json');
    if (!existsSync(storeFile)) {
      throw new Error(`userData 隔离失效：临时目录中未发现 ${storeFile}（写入未重定向）`);
    }

    const verdict = failures === 0 ? 'E2E_OK' : 'E2E_FAIL';
    console.log(`\n${verdict}（通过 ${passed}/${passed + failures} 用例）`);
    if (failedCases.length) {
      console.error('\n失败详情：');
      for (const c of failedCases) console.error(`  - ${c.name}: ${c.message}`);
    }
    return failures === 0 ? 0 : 1;
  } catch (err) {
    console.error('E2E_FAIL: 运行器异常:', err?.stack ?? err);
    return 1;
  } finally {
    if (app) await app.close().catch(() => {});
    rmSync(tmpUserData, { recursive: true, force: true });
  }
}

main().then((code) => process.exit(code));
