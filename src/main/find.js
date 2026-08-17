// find.js — 页内查找会话状态机（纯 Node 可单测，不依赖 Electron）
//
// 语义（Electron 37 findInPage 实测校准）：
//   open/close          会话开闭；close 清空 query 与计数（调用方负责 stopFindInPage 清高亮）
//   updateQuery(text)   输入变化：空 query → { action: 'clear' }（调用方清除高亮）；
//                       非空 → { action: 'search', options: { forward: true, findNext: true } }
//                       ——实测 findNext:true = 开启新查找会话（从头匹配、必发 found-in-page 事件）
//   step(forward)       继续翻找：仅当会话打开且 query 非空时有效，
//                       返回 { action: 'search', options: { forward, findNext: false } }
//                       ——实测 findNext:false = 跟随续找（当前序号前进/后退）；
//                       否则为无害 no-op（{ action: 'none' }）
//   setResult(result)   found-in-page 事件回报（matches 总数 / activeMatchOrdinal 当前序号）
export function createFindSession() {
  let open = false;
  let query = '';
  let matches = 0;
  let activeMatchOrdinal = 0;

  const reset = () => {
    query = '';
    matches = 0;
    activeMatchOrdinal = 0;
  };

  return {
    isOpen: () => open,
    get state() {
      return { open, query, matches, activeMatchOrdinal };
    },

    open() {
      open = true;
      reset();
    },
    close() {
      open = false;
      reset();
    },

    updateQuery(text) {
      query = String(text ?? '');
      if (query === '') {
        reset();
        return { action: 'clear' };
      }
      matches = 0;
      activeMatchOrdinal = 0;
      return { action: 'search', options: { forward: true, findNext: true } };
    },

    step(forward) {
      if (!open || query === '') return { action: 'none' };
      return { action: 'search', options: { forward: Boolean(forward), findNext: false } };
    },

    setResult(result) {
      matches = result?.matches ?? 0;
      activeMatchOrdinal = result?.activeMatchOrdinal ?? 0;
    },
  };
}
