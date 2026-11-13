import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  isDateKey,
  addDays,
  dayOfWeek,
  startOfWeek,
  weekDays,
  toDateKey,
  validateEntry,
  upsertEntry,
  removeEntry,
  restoreEntry,
  sortEntries,
  knownMembers,
  average,
  summarizeWeek,
  weeklyTrend,
  LIMITS,
} from '../src/core.js';

const TODAY = '2026-11-13'; // 金曜

let seq = 0;
const opts = () => ({ id: `id-${++seq}`, now: new Date(Date.UTC(2026, 10, 13, 0, 0, seq)).toISOString() });

function build(list) {
  return list.reduce((entries, [name, date, mood, note = 'メモ']) => {
    return upsertEntry(entries, { name, date, mood, note }, opts()).entries;
  }, []);
}

describe('日付', () => {
  test('isDateKey は実在する日付だけを通す', () => {
    assert.equal(isDateKey('2026-11-13'), true);
    assert.equal(isDateKey('2028-02-29'), true);
    assert.equal(isDateKey('2026-02-29'), false);
    assert.equal(isDateKey('2026-13-01'), false);
    assert.equal(isDateKey('2026-1-1'), false);
    assert.equal(isDateKey(''), false);
    assert.equal(isDateKey(null), false);
  });

  test('addDays は月・年をまたぐ', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2026-11-13', 0), '2026-11-13');
  });

  test('週は月曜はじまり', () => {
    assert.equal(dayOfWeek('2026-11-09'), 0); // 月
    assert.equal(dayOfWeek('2026-11-15'), 6); // 日
    assert.equal(startOfWeek('2026-11-13'), '2026-11-09');
    assert.equal(startOfWeek('2026-11-15'), '2026-11-09');
    assert.equal(startOfWeek('2026-11-16'), '2026-11-16');
  });

  test('weekDays は年をまたぐ週も7日返す', () => {
    assert.deepEqual(weekDays('2027-01-01'), [
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31',
      '2027-01-01', '2027-01-02', '2027-01-03',
    ]);
  });

  test('toDateKey はローカル日付を使う', () => {
    assert.equal(toDateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  });
});

describe('validateEntry', () => {
  const valid = { name: 'さくら', date: TODAY, mood: '4', note: 'いい日' };

  test('正しい入力は整えた値を返す', () => {
    const r = validateEntry({ ...valid, name: '  さくら　 ', note: ' いい日 ' }, { today: TODAY });
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, { name: 'さくら', date: TODAY, mood: 4, note: 'いい日' });
  });

  test('空の入力はすべての項目でエラーになる', () => {
    const r = validateEntry({ name: ' ', date: '', mood: '', note: '' }, { today: TODAY });
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.errors).sort(), ['date', 'mood', 'name', 'note']);
    assert.equal(r.value, undefined);
  });

  test('未来の日付は記録できない', () => {
    const r = validateEntry({ ...valid, date: '2026-11-14' }, { today: TODAY });
    assert.match(r.errors.date, /未来/);
  });

  test('存在しない日付はエラー', () => {
    const r = validateEntry({ ...valid, date: '2026-02-30' }, { today: TODAY });
    assert.match(r.errors.date, /形式/);
  });

  test('気分は1〜5の整数だけ', () => {
    for (const mood of ['0', '6', '2.5', 'abc', null, undefined]) {
      const r = validateEntry({ ...valid, mood }, { today: TODAY });
      assert.equal(r.ok, false, `mood=${mood}`);
      assert.ok(r.errors.mood);
    }
    assert.equal(validateEntry({ ...valid, mood: 1 }, { today: TODAY }).ok, true);
    assert.equal(validateEntry({ ...valid, mood: 5 }, { today: TODAY }).ok, true);
  });

  test('文字数の上限は文字単位（絵文字も1文字）で数える', () => {
    const okNote = '😊'.repeat(LIMITS.note);
    assert.equal(validateEntry({ ...valid, note: okNote }, { today: TODAY }).ok, true);

    const r = validateEntry({ ...valid, note: 'あ'.repeat(LIMITS.note + 1) }, { today: TODAY });
    assert.match(r.errors.note, /81文字/);

    const n = validateEntry({ ...valid, name: 'な'.repeat(LIMITS.name + 1) }, { today: TODAY });
    assert.ok(n.errors.name);
  });
});

describe('記録の追加・削除', () => {
  test('追加すると新しい配列が返り、元の配列は変わらない', () => {
    const before = [];
    const r = upsertEntry(before, { name: 'さくら', date: TODAY, mood: 4, note: 'a' }, { id: 'x', now: 'T1' });
    assert.equal(before.length, 0);
    assert.equal(r.entries.length, 1);
    assert.equal(r.replaced, false);
    assert.deepEqual(r.entry, { id: 'x', name: 'さくら', date: TODAY, mood: 4, note: 'a', createdAt: 'T1', updatedAt: 'T1' });
  });

  test('同じメンバー・同じ日は上書き（大文字小文字・空白の違いは同一人物）', () => {
    const first = upsertEntry([], { name: 'Ken', date: TODAY, mood: 2, note: 'a' }, { id: 'x', now: 'T1' });
    const second = upsertEntry(first.entries, { name: ' ken ', date: TODAY, mood: 5, note: 'b' }, { id: 'y', now: 'T2' });
    assert.equal(second.replaced, true);
    assert.equal(second.entries.length, 1);
    assert.equal(second.entry.id, 'x');
    assert.equal(second.entry.mood, 5);
    assert.equal(second.entry.createdAt, 'T1');
    assert.equal(second.entry.updatedAt, 'T2');
  });

  test('別の日・別のメンバーなら別の記録', () => {
    const entries = build([
      ['さくら', '2026-11-12', 3],
      ['さくら', TODAY, 4],
      ['けんた', TODAY, 2],
    ]);
    assert.equal(entries.length, 3);
  });

  test('削除と取り消し', () => {
    const entries = build([['さくら', TODAY, 3], ['けんた', TODAY, 4]]);
    const { entries: after, removed } = removeEntry(entries, entries[0].id);
    assert.equal(after.length, 1);
    assert.equal(removed.name, 'さくら');

    const back = restoreEntry(after, removed);
    assert.equal(back.restored, true);
    assert.equal(back.entries.length, 2);
  });

  test('存在しない id の削除は何もしない', () => {
    const entries = build([['さくら', TODAY, 3]]);
    const r = removeEntry(entries, 'nope');
    assert.equal(r.removed, null);
    assert.equal(r.entries, entries);
  });

  test('取り消しの間に同じ日の記録が作られていたら戻さない', () => {
    const entries = build([['さくら', TODAY, 3]]);
    const { entries: after, removed } = removeEntry(entries, entries[0].id);
    const rewritten = upsertEntry(after, { name: 'さくら', date: TODAY, mood: 5, note: '再記録' }, opts()).entries;
    const r = restoreEntry(rewritten, removed);
    assert.equal(r.restored, false);
    assert.equal(r.entries.length, 1);
    assert.equal(r.entries[0].note, '再記録');
  });

  test('並び順は新しい日付が先', () => {
    const entries = build([['a', '2026-11-10', 3], ['b', '2026-11-12', 3], ['c', '2026-11-11', 3]]);
    assert.deepEqual(sortEntries(entries).map((e) => e.date), ['2026-11-12', '2026-11-11', '2026-11-10']);
  });

  test('knownMembers は最近記録した順で重複なし', () => {
    const entries = build([['さくら', '2026-11-10', 3], ['けんた', '2026-11-12', 3], ['さくら', '2026-11-11', 3]]);
    assert.deepEqual(knownMembers(entries), ['けんた', 'さくら']);
  });
});

describe('集計', () => {
  test('average は小数第2位で丸め、空なら null', () => {
    assert.equal(average([]), null);
    assert.equal(average([4, 5, 5]), 4.67);
    assert.equal(average([3]), 3);
  });

  test('summarizeWeek は週の範囲だけを集計する', () => {
    const entries = build([
      ['さくら', '2026-11-08', 1], // 前の週の日曜（含まない）
      ['さくら', '2026-11-09', 4],
      ['さくら', '2026-11-10', 5],
      ['けんた', '2026-11-10', 2],
      ['けんた', '2026-11-15', 3], // 日曜（含む）
      ['ゆい', '2026-11-16', 5], // 次の週（含まない）
    ]);
    const s = summarizeWeek(entries, TODAY);
    assert.equal(s.start, '2026-11-09');
    assert.equal(s.end, '2026-11-15');
    assert.equal(s.count, 4);
    assert.equal(s.average, 3.5);
    assert.deepEqual(s.distribution, [0, 1, 1, 1, 1]);
    assert.deepEqual(s.members.map((m) => m.name), ['けんた', 'さくら']);

    const sakura = s.members.find((m) => m.name === 'さくら');
    assert.equal(sakura.average, 4.5);
    assert.deepEqual(sakura.days.map((d) => d?.mood ?? null), [4, 5, null, null, null, null, null]);

    assert.deepEqual(s.byDay[1], { date: '2026-11-10', count: 2, average: 3.5 });
    assert.equal(s.byDay[2].average, null);
    assert.equal(s.bestDay.date, '2026-11-09');
    assert.deepEqual(s.entries.map((e) => e.date), ['2026-11-15', '2026-11-10', '2026-11-10', '2026-11-09']);
  });

  test('記録のない週は平均 null・空のメンバー', () => {
    const s = summarizeWeek([], TODAY);
    assert.equal(s.count, 0);
    assert.equal(s.average, null);
    assert.equal(s.bestDay, null);
    assert.deepEqual(s.members, []);
    assert.deepEqual(s.distribution, [0, 0, 0, 0, 0]);
  });

  test('weeklyTrend は古い順に週の平均と前週との差を返す', () => {
    const entries = build([
      ['さくら', '2026-10-21', 1], // 4週前より前（比較用）
      ['さくら', '2026-10-27', 2],
      ['さくら', '2026-11-03', 3],
      ['けんた', '2026-11-04', 4],
      ['さくら', '2026-11-12', 5],
    ]);
    const t = weeklyTrend(entries, TODAY, 3);
    assert.deepEqual(t.map((p) => p.start), ['2026-10-26', '2026-11-02', '2026-11-09']);
    assert.deepEqual(t.map((p) => p.average), [2, 3.5, 5]);
    assert.deepEqual(t.map((p) => p.count), [1, 2, 1]);
    assert.deepEqual(t.map((p) => p.delta), [1, 1.5, 1.5]);
  });

  test('weeklyTrend は記録のない週をはさむと差が null', () => {
    const entries = build([['さくら', '2026-10-28', 3], ['さくら', '2026-11-12', 4]]);
    const t = weeklyTrend(entries, TODAY, 3);
    assert.deepEqual(t.map((p) => p.average), [3, null, 4]);
    assert.deepEqual(t.map((p) => p.delta), [null, null, null]);
  });
});
