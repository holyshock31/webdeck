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

  function save() {
    // 串行化写入 + 临时文件原子替换
    writing = writing.then(async () => {
      const data = cache ?? { apps: [], settings: {} };
      const tmp = `${file}.tmp`;
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tmp, file);
    }).catch((err) => console.error('[webdeck] store save failed:', err));
    return writing;
  }

  return { load, save, file };
}
