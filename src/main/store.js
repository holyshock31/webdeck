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

  /**
   * 持久化数据。传 data 时写入该数据并同步内存缓存；不传时写入当前缓存。
   * 写入串行化 + 临时文件原子替换。
   * @param {{apps?: Array, settings?: object}} [data]
   */
  function save(data) {
    // 在写队列中求值，保证读到的是最新数组内容（调用方可能在排队期间继续 push）
    writing = writing.then(async () => {
      const payload = data ?? cache;
      const tmp = `${file}.tmp`;
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
      await fs.rename(tmp, file);
      cache = payload; // 写盘后同步内存缓存，后续 load()/save() 基于最新数据
    }).catch((err) => console.error('[webdeck] store save failed:', err));
    return writing;
  }

  /** 只更新 settings 部分。 */
  function updateSettings(patch) {
    return save({ ...cache, settings: { ...cache.settings, ...patch } });
  }

  return { load, save, updateSettings, file };
}
