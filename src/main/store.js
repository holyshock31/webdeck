// store.js — 极简 JSON 持久化（原子写入，防损坏）
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * @param {string} baseDir 数据目录（主进程传 app.getPath('userData')）
 */
export function createStore(baseDir) {
  const file = path.join(baseDir, 'webdeck.json');
  let cache = null;
  let writing = Promise.resolve();

  async function load() {
    if (cache) return cache;
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(raw);
      cache = {
        apps: Array.isArray(parsed?.apps) ? parsed.apps : [],
        settings: parsed?.settings ?? {},
      };
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('[webdeck] store read failed, starting fresh:', err.message);
      cache = { apps: [], settings: {} };
    }
    return cache;
  }

  /** 原子写盘 + 同步内存缓存（在写队列内调用）。 */
  async function writePayload(payload) {
    const tmp = `${file}.tmp`;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
    await fs.rename(tmp, file);
    cache = payload; // 写盘后同步内存缓存，后续 load()/save() 基于最新数据
  }

  /** 把任务追加进写队列（串行化，任一失败不阻断后续）。 */
  function enqueue(task) {
    writing = writing.then(task).catch((err) => console.error('[webdeck] store save failed:', err));
    return writing;
  }

  /**
   * 持久化数据。传 data 时写入该数据并同步内存缓存；不传时写入当前缓存。
   * 写入串行化 + 临时文件原子替换。
   * @param {{apps?: Array, settings?: object}} [data]
   */
  function save(data) {
    // 在写队列中求值，保证读到的是最新数组内容（调用方可能在排队期间继续 push）
    return enqueue(() => writePayload(data ?? cache));
  }

  /**
   * 只更新 settings 部分。合并发生在写队列执行时（而非调用时）——
   * 连续两次 updateSettings 并发时，第二次基于第一次写盘后的最新 cache 合并，
   * 避免丢失前一次写入的字段（如收起路径同时写 sidebarWidth 与 sidebarCollapsed）。
   */
  function updateSettings(patch) {
    return enqueue(() => writePayload({ ...cache, settings: { ...cache.settings, ...patch } }));
  }

  return { load, save, updateSettings, file };
}
