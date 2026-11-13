// チームの気分ログ — 画面に依存しない中心ロジック。
// 日付はすべて "YYYY-MM-DD" の文字列（日付キー）で扱い、計算は UTC で行う（タイムゾーンや夏時間の影響を受けない）。
// 週は月曜はじまり。

export const MOODS = Object.freeze([
  { value: 1, label: 'しんどい' },
  { value: 2, label: 'いまいち' },
  { value: 3, label: 'ふつう' },
  { value: 4, label: 'いい感じ' },
  { value: 5, label: '最高' },
]);

export const LIMITS = Object.freeze({ name: 20, note: 80 });

const DAY_MS = 86_400_000;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n) => String(n).padStart(2, '0');
const charLength = (s) => [...s].length;
const round2 = (n) => Math.round(n * 100) / 100;

export function moodLabel(value) {
  return MOODS.find((m) => m.value === value)?.label ?? '';
}

// ---- 日付 ----

export function isDateKey(value) {
  if (typeof value !== 'string') return false;
  const m = DATE_KEY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

const toMs = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const fromMs = (ms) => {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

/** ローカル時刻の Date を日付キーにする（「今日」を求めるときに使う） */
export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(key, days) {
  return fromMs(toMs(key) + days * DAY_MS);
}

/** 0 = 月曜 … 6 = 日曜 */
export function dayOfWeek(key) {
  return (new Date(toMs(key)).getUTCDay() + 6) % 7;
}

export function startOfWeek(key) {
  return addDays(key, -dayOfWeek(key));
}

export function weekDays(key) {
  const start = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// ---- 入力の検証 ----

export function normalizeName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim();
}

const sameName = (a, b) => normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase();

/**
 * フォームの入力を検証する。
 * 成功: { ok: true, errors: {}, value: { name, date, mood, note } }
 * 失敗: { ok: false, errors: { name?, date?, mood?, note? } }（値は画面に出すメッセージ）
 */
export function validateEntry(input, { today }) {
  const errors = {};

  const name = normalizeName(input.name);
  if (!name) errors.name = '名前を入力してください';
  else if (charLength(name) > LIMITS.name) errors.name = `名前は${LIMITS.name}文字以内で入力してください`;

  const date = input.date;
  if (!date) errors.date = '日付を選んでください';
  else if (!isDateKey(date)) errors.date = '日付の形式が正しくありません';
  else if (date > today) errors.date = '未来の日付には記録できません';

  const mood = Number(input.mood);
  if (input.mood === '' || input.mood == null || !Number.isInteger(mood) || mood < 1 || mood > 5) {
    errors.mood = '気分を5段階から選んでください';
  }

  const note = String(input.note ?? '').trim();
  const noteLength = charLength(note);
  if (!note) errors.note = 'ひとことを入力してください';
  else if (noteLength > LIMITS.note) {
    errors.note = `ひとことは${LIMITS.note}文字以内にしてください（いま${noteLength}文字）`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, errors, value: { name, date, mood, note } };
}

// ---- 記録の追加・削除 ----

/**
 * 記録を追加する。同じメンバー・同じ日の記録があれば上書きする（1人1日1件）。
 * 元の配列は変更しない。
 */
export function upsertEntry(entries, value, { id, now }) {
  const index = entries.findIndex((e) => e.date === value.date && sameName(e.name, value.name));
  if (index === -1) {
    const entry = { id, ...value, createdAt: now, updatedAt: now };
    return { entries: [...entries, entry], entry, replaced: false };
  }
  const entry = { ...entries[index], ...value, updatedAt: now };
  const next = entries.slice();
  next[index] = entry;
  return { entries: next, entry, replaced: true };
}

export function removeEntry(entries, id) {
  const removed = entries.find((e) => e.id === id) ?? null;
  return { entries: removed ? entries.filter((e) => e.id !== id) : entries, removed };
}

/** 削除の取り消し。その間に同じメンバー・同じ日の記録が作られていたら戻さない。 */
export function restoreEntry(entries, entry) {
  const conflict = entries.some(
    (e) => e.id === entry.id || (e.date === entry.date && sameName(e.name, entry.name)),
  );
  if (conflict) return { entries, restored: false };
  return { entries: [...entries, entry], restored: true };
}

/** 新しい日付順、同じ日なら更新が新しい順 */
export function sortEntries(entries) {
  return entries.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
  });
}

/** 記録したことのあるメンバー名（最近記録した順、重複なし） */
export function knownMembers(entries) {
  const seen = new Set();
  const names = [];
  for (const e of sortEntries(entries)) {
    const key = normalizeName(e.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(e.name);
  }
  return names;
}

// ---- 集計 ----

export function average(values) {
  if (values.length === 0) return null;
  return round2(values.reduce((sum, v) => sum + v, 0) / values.length);
}

const inRange = (entries, start, end) => entries.filter((e) => e.date >= start && e.date <= end);

/** key を含む週（月〜日）の集計 */
export function summarizeWeek(entries, key) {
  const days = weekDays(key);
  const start = days[0];
  const end = days[6];
  const weekEntries = inRange(entries, start, end);

  const distribution = [0, 0, 0, 0, 0];
  for (const e of weekEntries) distribution[e.mood - 1] += 1;

  const names = knownMembers(weekEntries).sort((a, b) => a.localeCompare(b, 'ja'));
  const members = names.map((name) => {
    const own = weekEntries.filter((e) => sameName(e.name, name));
    return {
      name,
      average: average(own.map((e) => e.mood)),
      days: days.map((d) => own.find((e) => e.date === d) ?? null),
    };
  });

  const byDay = days.map((date) => {
    const moods = weekEntries.filter((e) => e.date === date).map((e) => e.mood);
    return { date, count: moods.length, average: average(moods) };
  });

  const best = byDay
    .filter((d) => d.average !== null)
    .reduce((top, d) => (top === null || d.average > top.average ? d : top), null);

  return {
    start,
    end,
    days,
    count: weekEntries.length,
    average: average(weekEntries.map((e) => e.mood)),
    distribution,
    members,
    byDay,
    bestDay: best,
    entries: sortEntries(weekEntries),
  };
}

/**
 * key の週を最後とする直近 weeks 週ぶんの平均。古い順。
 * delta は前の週との差（どちらかに記録がなければ null）。
 */
export function weeklyTrend(entries, key, weeks = 8) {
  const last = startOfWeek(key);
  const weekAverage = (start) => {
    const moods = inRange(entries, start, addDays(start, 6)).map((e) => e.mood);
    return { count: moods.length, average: average(moods) };
  };

  let previous = weekAverage(addDays(last, -7 * weeks)).average;
  const points = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addDays(last, -7 * i);
    const { count, average: avg } = weekAverage(start);
    const delta = avg !== null && previous !== null ? round2(avg - previous) : null;
    points.push({ start, count, average: avg, delta });
    previous = avg;
  }
  return points;
}
