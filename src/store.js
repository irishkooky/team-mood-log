// localStorage への保存と読み込み。storage は差し替え可能（テストでは偽物を渡す）。

import { isDateKey, hasMood } from './core.js';

export const STORAGE_KEY = 'team-mood-log/v1';

export function serialize(entries) {
  return JSON.stringify({ version: 1, entries });
}

// 名前・ひとことは空文字、気分は null でもよい（どれも任意項目）
const isStoredEntry = (e) =>
  e !== null &&
  typeof e === 'object' &&
  typeof e.id === 'string' &&
  typeof e.name === 'string' &&
  (e.mood === null || hasMood(e.mood)) &&
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

/**
 * 書き出した JSON ファイルの中身を読む（記録の配列だけのファイルも受け付ける）。
 * 成功: { ok: true, entries, skipped }（skipped は読めずに飛ばした件数）
 * 失敗: { ok: false, error }（error は画面に出すメッセージ）
 */
export function parseImport(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'JSON として読み込めませんでした' };
  }
  const list = Array.isArray(data) ? data : data?.entries;
  if (!Array.isArray(list)) return { ok: false, error: '気分ログの書き出しファイルではないようです' };
  const entries = list.filter(isStoredEntry);
  if (entries.length === 0) return { ok: false, error: '読み込める記録が見つかりませんでした' };
  return { ok: true, entries, skipped: list.length - entries.length };
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
