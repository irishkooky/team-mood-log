import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, deserialize, parseImport, serialize, STORAGE_KEY } from '../src/store.js';
import { createSampleEntries } from '../src/sample.js';
import { isDateKey } from '../src/core.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    data,
  };
}

const entry = { id: 'a', name: 'さくら', date: '2026-11-13', mood: 4, note: 'いい日', createdAt: 'T', updatedAt: 'T' };

describe('保存と読み込み', () => {
  test('保存したものをそのまま読み戻せる（閉じても残る）', () => {
    const storage = memoryStorage();
    assert.equal(createStore(storage).save([entry]), true);
    const loaded = createStore(storage).load();
    assert.deepEqual(loaded, { entries: [entry], recovered: false, unavailable: false });
  });

  test('何も保存されていなければ空', () => {
    assert.deepEqual(createStore(memoryStorage()).load().entries, []);
  });

  test('壊れた JSON は空として扱い、recovered を立てる', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{not json' });
    assert.deepEqual(createStore(storage).load(), { entries: [], recovered: true, unavailable: false });
  });

  test('不正な記録だけを取り除く', () => {
    const raw = JSON.stringify({
      version: 1,
      entries: [entry, { ...entry, id: 'b', mood: 9 }, { ...entry, id: 'c', date: '2026-02-31' }, null],
    });
    const r = deserialize(raw);
    assert.deepEqual(r.entries.map((e) => e.id), ['a']);
    assert.equal(r.recovered, true);
  });

  test('名前・ひとことが空、気分が null の記録も保存・読み込みできる', () => {
    const blank = { ...entry, id: 'z', name: '', mood: null, note: '' };
    assert.deepEqual(deserialize(serialize([entry, blank])), { entries: [entry, blank], recovered: false });
    assert.deepEqual(parseImport(serialize([blank])).entries, [blank]);
  });

  test('serialize はバージョンつき', () => {
    assert.deepEqual(JSON.parse(serialize([entry])), { version: 1, entries: [entry] });
  });

  test('localStorage が使えなくても落ちない', () => {
    const broken = {
      getItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('QuotaExceededError'); },
    };
    const store = createStore(broken);
    assert.equal(store.load().unavailable, true);
    assert.equal(store.save([entry]), false);
  });
});

describe('サンプルデータ', () => {
  test('今日までの平日だけ・1人1日1件・正しい値', () => {
    let n = 0;
    const entries = createSampleEntries({ today: '2026-11-13', makeId: () => `s${++n}`, now: 'T' });
    assert.ok(entries.length > 20);
    const keys = new Set();
    for (const e of entries) {
      assert.ok(isDateKey(e.date) && e.date <= '2026-11-13');
      assert.ok(e.mood >= 1 && e.mood <= 5);
      const key = `${e.name}/${e.date}`;
      assert.ok(!keys.has(key), `重複: ${key}`);
      keys.add(key);
    }
    // 読み書きで壊れないこと
    assert.equal(deserialize(serialize(entries)).entries.length, entries.length);
  });
});

describe('JSON ファイルの読み込み', () => {
  test('書き出したファイルをそのまま読める', () => {
    assert.deepEqual(parseImport(serialize([entry])), { ok: true, entries: [entry], skipped: 0 });
  });

  test('記録の配列だけのファイルも受け付ける', () => {
    assert.deepEqual(parseImport(JSON.stringify([entry])).entries, [entry]);
  });

  test('不正な記録は飛ばして件数を返す', () => {
    const r = parseImport(JSON.stringify({ entries: [entry, { ...entry, id: 'b', mood: 0 }, 'x'] }));
    assert.equal(r.ok, true);
    assert.equal(r.entries.length, 1);
    assert.equal(r.skipped, 2);
  });

  test('読めないファイルは理由つきで失敗する', () => {
    assert.equal(parseImport('{oops').ok, false);
    assert.equal(parseImport('{"foo": 1}').ok, false);
    assert.equal(parseImport('null').ok, false);
    assert.equal(parseImport(JSON.stringify({ entries: [{ id: 1 }] })).ok, false);
    assert.equal(typeof parseImport('{oops').error, 'string');
  });
});
