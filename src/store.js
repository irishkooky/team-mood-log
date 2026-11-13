// localStorage への保存と読み込み。storage は差し替え可能（テストでは偽物を渡す）。

import { isDateKey } from './core.js';

export const STORAGE_KEY = 'team-mood-log/v1';

export function serialize(entries) {
  return JSON.stringify({ version: 1, entries });
}

const isStoredEntry = (e) =>
  e !== null &&
  typeof e === 'object' &&
  typeof e.id === 'string' &&
  typeof e.name === 'string' &&
  e.name.trim() !== '' &&
  Number.isInteger(e.mood) &&
  e.mood >= 1 &&
  e.mood <= 5 &&
  typeof e.note === 'string' &&
  isDateKey(e.date);

/**
 * 保存された文字列を記録の配列に戻す。壊れたデータは捨てる。
 * recovered: 読めなかった部分があったら true
 */
export function deserialize(raw) {
  if (raw == null || raw === '') return { entries: [], recovered: false };
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data?.entries)) return { entries: [], recovered: true };
    const entries = data.entries.filter(isStoredEntry);
    return { entries, recovered: entries.length !== data.entries.length };
  } catch {
    return { entries: [], recovered: true };
  }
}

export function createStore(storage) {
  return {
    /** unavailable: localStorage が使えない（プライベートモードなど） */
    load() {
      try {
        return { ...deserialize(storage.getItem(STORAGE_KEY)), unavailable: false };
      } catch {
        return { entries: [], recovered: false, unavailable: true };
      }
    },
    /** 保存できたら true */
    save(entries) {
      try {
        storage.setItem(STORAGE_KEY, serialize(entries));
        return true;
      } catch {
        return false;
      }
    },
  };
}
