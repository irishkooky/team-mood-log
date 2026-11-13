// 「サンプルで試す」用のデータ。乱数は種つきなので毎回同じ内容になる。

import { addDays, dayOfWeek } from './core.js';

const MEMBERS = ['さくら', 'けんた', 'ゆい', 'はると'];

const NOTES = {
  1: ['寝不足でつらい…', '障害対応で一日終わった', '頭痛がひどい'],
  2: ['会議が多くて集中できず', 'ちょっと疲れ気味', 'レビュー待ちで手が止まった'],
  3: ['いつも通り', '淡々と進めた', '可もなく不可もなく'],
  4: ['ペアプロが楽しかった', 'タスクがきれいに片付いた', 'ランチがおいしかった'],
  5: ['リリースできた！', '新機能が好評でうれしい', '最高のふりかえりだった'],
};

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** today までの約6週間ぶん、平日の記録を作る */
export function createSampleEntries({ today, makeId, now }) {
  const random = seeded(20261113);
  const entries = [];
  for (let back = 41; back >= 0; back -= 1) {
    const date = addDays(today, -back);
    if (dayOfWeek(date) >= 5) continue;
    MEMBERS.forEach((name, i) => {
      if (random() < 0.15) return;
      // 少しずつ上向きになるように（週ごとの傾向が見えるように）
      const base = 2.5 + i * 0.15 + (41 - back) * 0.03;
      const mood = Math.min(5, Math.max(1, Math.round(base + (random() - 0.5) * 2.4)));
      const notes = NOTES[mood];
      const note = notes[Math.floor(random() * notes.length)];
      entries.push({ id: makeId(), name, date, mood, note, createdAt: now, updatedAt: now });
    });
  }
  return entries;
}
