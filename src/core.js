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

/** さかのぼって記録できる日数（今日を含めず 365 日前まで） */
export const MAX_PAST_DAYS = 365;

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

/** フォームから記録できるいちばん古い日付 */
export function oldestDateKey(today) {
  return addDays(today, -MAX_PAST_DAYS);
}

export function normalizeName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim();
}

const sameName = (a, b) => normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase();

/** 気分が記録されているか（気分は任意なので null のこともある） */
export const hasMood = (mood) => Number.isInteger(mood) && mood >= 1 && mood <= 5;

/**
 * 1人1日1件の「同じ枠」か。名前のない記録は誰のものか分からないので、id が同じときだけ同じとみなす。
 */
const sameSlot = (a, b) => {
  if (!normalizeName(a.name) || !normalizeName(b.name)) return a.id != null && a.id === b.id;
  return a.date === b.date && sameName(a.name, b.name);
};

/**
 * フォームの入力を検証する。項目はすべて任意。
 * 日付が空なら today、気分が空なら null、名前・ひとことが空なら '' になる。
 * ただし名前・気分・ひとことがすべて空の記録は作らない。
 * 成功: { ok: true, errors: {}, value: { name, date, mood, note } }
 * 失敗: { ok: false, errors: { name?, date?, mood?, note? } }（値は画面に出すメッセージ）
 */
export function validateEntry(input, { today }) {
  const errors = {};

  const name = normalizeName(input.name);
  if (charLength(name) > LIMITS.name) errors.name = `名前は${LIMITS.name}文字以内で入力してください`;

  const date = input.date || today;
  if (!isDateKey(date)) errors.date = '日付の形式が正しくありません';
  else if (date > today) errors.date = '未来の日付には記録できません';
  else if (date < oldestDateKey(today)) errors.date = `${MAX_PAST_DAYS}日より前の日付には記録できません`;

  let mood = null;
  if (input.mood !== '' && input.mood != null) {
    mood = Number(input.mood);
    if (!hasMood(mood)) errors.mood = '気分は5段階から選んでください';
  }

  const note = String(input.note ?? '').trim();
  const noteLength = charLength(note);
  if (noteLength > LIMITS.note) {
    errors.note = `ひとことは${LIMITS.note}文字以内にしてください（いま${noteLength}文字）`;
  }

  if (Object.keys(errors).length === 0 && !name && mood === null && !note) {
    errors.mood = '名前・気分・ひとことのどれかを入力してください';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, errors, value: { name, date, mood, note } };
}

// ---- 記録の追加・削除 ----

/**
 * 記録を追加する。同じメンバー・同じ日の記録があれば上書きする（1人1日1件）。
 * 名前のない記録は上書きせず、毎回新しく追加する。元の配列は変更しない。
 */
export function upsertEntry(entries, value, { id, now }) {
  const index = entries.findIndex((e) => sameSlot(e, value));
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
  const conflict = entries.some((e) => e.id === entry.id || sameSlot(e, entry));
  if (conflict) return { entries, restored: false };
  return { entries: [...entries, entry], restored: true };
}

/**
 * 読み込んだ記録を今の記録にまぜる。1人1日1件を保ち、同じメンバー・同じ日が重なったら更新が新しいほうを残す。
 * 別の記録と id がぶつかったときは makeId で振り直す。元の配列は変更しない。
 */
export function mergeEntries(entries, incoming, { makeId }) {
  const next = entries.slice();
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const raw of incoming) {
    const item = { ...raw, name: normalizeName(raw.name) };
    const index = next.findIndex((e) => sameSlot(e, item));
    if (index === -1) {
      if (next.some((e) => e.id === item.id)) item.id = makeId();
      next.push(item);
      added += 1;
    } else if (String(item.updatedAt ?? '') > String(next[index].updatedAt ?? '')) {
      next[index] = { ...item, id: next[index].id };
      updated += 1;
    } else {
      unchanged += 1;
    }
  }
  return { entries: next, added, updated, unchanged };
}

/** 新しい日付順、同じ日なら更新が新しい順 */
export function sortEntries(entries) {
  return entries.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
  });
}

/** 記録したことのあるメンバー名（最近記録した順、重複なし。名前のない記録は含めない） */
export function knownMembers(entries) {
  const seen = new Set();
  const names = [];
  for (const e of sortEntries(entries)) {
    const key = normalizeName(e.name).toLowerCase();
    if (!key || seen.has(key)) continue;
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

/** 気分が記録されているものだけの気分の配列（平均・分布は気分のある記録だけで出す） */
const moodsOf = (entries) => entries.map((e) => e.mood).filter(hasMood);

/**
 * key を含む週（月〜日）の集計。
 * count は記録の件数、rated はそのうち気分が記録されている件数。
 * members（メンバー × 曜日）には名前のある記録だけが入る。
 */
export function summarizeWeek(entries, key) {
  const days = weekDays(key);
  const start = days[0];
  const end = days[6];
  const weekEntries = inRange(entries, start, end);
  const moods = moodsOf(weekEntries);

  const distribution = [0, 0, 0, 0, 0];
  for (const mood of moods) distribution[mood - 1] += 1;

  const names = knownMembers(weekEntries).sort((a, b) => a.localeCompare(b, 'ja'));
  const members = names.map((name) => {
    const own = weekEntries.filter((e) => sameName(e.name, name));
    return {
      name,
      average: average(moodsOf(own)),
      days: days.map((d) => own.find((e) => e.date === d) ?? null),
    };
  });

  const byDay = days.map((date) => {
    const dayMoods = moodsOf(weekEntries.filter((e) => e.date === date));
    return { date, count: dayMoods.length, average: average(dayMoods) };
  });

  const best = byDay
    .filter((d) => d.average !== null)
    .reduce((top, d) => (top === null || d.average > top.average ? d : top), null);

  return {
    start,
    end,
    days,
    count: weekEntries.length,
    rated: moods.length,
    average: average(moods),
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
    const moods = moodsOf(inRange(entries, start, addDays(start, 6)));
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
