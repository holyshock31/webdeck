// file-logger.js — 主进程落盘日志（userData/logs/webdeck.log，按大小轮转）
// 纯 Node，无 Electron 依赖；GUI 启动的打包版无终端，落盘日志是查看
// 启动链路（[launch]/[env]/[resolve]/[spawn]/[exit]/[judge]）的唯一途径。
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_MAX_BYTES = 1024 * 1024; // 1MB
export const DEFAULT_KEEP = 3;

/** 判断日志文件是否达到轮转阈值（纯函数，可单测）。 */
export function shouldRotate(filePath, maxBytes = DEFAULT_MAX_BYTES) {
  try {
    return fs.statSync(filePath).size >= maxBytes;
  } catch {
    return false; // 文件不存在视为无需轮转
  }
}

/** 轮转重命名链：base.(keep-1) 删除，base.i → base.(i+1)，base → base.1（纯函数，可单测）。 */
export function rotateFiles(dir, base = 'webdeck.log', keep = DEFAULT_KEEP) {
  for (let i = keep - 1; i >= 1; i--) {
    const oldPath = path.join(dir, `${base}.${i}`);
    const nextPath = path.join(dir, `${base}.${i + 1}`);
    try { if (fs.existsSync(nextPath)) fs.unlinkSync(nextPath); } catch { /* ignore */ }
    try { if (fs.existsSync(oldPath)) fs.renameSync(oldPath, nextPath); } catch { /* ignore */ }
  }
  const cur = path.join(dir, base);
  try { if (fs.existsSync(cur)) fs.renameSync(cur, path.join(dir, `${base}.1`)); } catch { /* ignore */ }
}

/** 创建落盘日志器：log(line) 追加写入（带时间戳），超限自动轮转；失败不阻塞主流程。 */
export function createFileLogger(logDir, { base = 'webdeck.log', maxBytes = DEFAULT_MAX_BYTES, keep = DEFAULT_KEEP } = {}) {
  try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }
  const file = path.join(logDir, base);

  function log(line) {
    try {
      if (shouldRotate(file, maxBytes)) rotateFiles(logDir, base, keep);
      fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`, 'utf8');
    } catch { /* 日志失败不阻塞主流程 */ }
  }

  return { log, dir: logDir, file };
}
