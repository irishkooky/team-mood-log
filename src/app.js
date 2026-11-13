// 画面の描画とイベント。計算はすべて core.js、保存は store.js に任せる。

import {
  MOODS,
  LIMITS,
  moodLabel,
  toDateKey,
  addDays,
  dayOfWeek,
  startOfWeek,
  validateEntry,
  upsertEntry,
  removeEntry,
  restoreEntry,
  knownMembers,
  summarizeWeek,
  weeklyTrend,
} from './core.js';
import { createStore, serialize } from './store.js';
import { createSampleEntries } from './sample.js';

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
const FIELDS = ['name', 'date', 'mood', 'note'];

const $ = (id) => document.getElementById(id);
const form = $('entry-form');
const dashboard = $('dashboard');
const tooltip = $('tooltip');

const store = createStore(getLocalStorage());
const loaded = store.load();

const state = {
  entries: loaded.entries,
  week: startOfWeek(todayKey()),
  errors: {},
  flashId: null,
};

function getLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function todayKey() {
  return toDateKey(new Date());
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ---- 書式 ----

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ymd = (key) => key.split('-').map(Number);
const fmtShort = (key) => `${ymd(key)[1]}/${ymd(key)[2]}`;
const fmtMonthDay = (key) => `${ymd(key)[1]}月${ymd(key)[2]}日`;
const fmtWithDow = (key) => `${fmtShort(key)}（${WEEKDAYS[dayOfWeek(key)]}）`;
const fmtAvg = (v) => (v === null ? '—' : v.toFixed(1));
// 色は表示している小数第1位の値に合わせる（3.47 と 3.50 がどちらも「3.5」なのに色が違う、を避ける）
const moodOf = (avg) => (avg === null ? null : Math.min(5, Math.max(1, Math.round(Math.round(avg * 10) / 10))));
const weeksBetween = (later, earlier) => Math.round((Date.parse(later) - Date.parse(earlier)) / (7 * 86_400_000));

// ---- 顔のアイコン ----

const FACE_PARTS = {
  1: '<path d="M10.5 14.8 L16.5 12.5 M29.5 14.8 L23.5 12.5"/><circle class="dot" cx="14.5" cy="19" r="2"/><circle class="dot" cx="25.5" cy="19" r="2"/><path d="M13 29.5 Q20 22 27 29.5"/>',
  2: '<circle class="dot" cx="14.5" cy="17.5" r="2"/><circle class="dot" cx="25.5" cy="17.5" r="2"/><path d="M14 28 Q20 24.5 26 28"/>',
  3: '<circle class="dot" cx="14.5" cy="17" r="2"/><circle class="dot" cx="25.5" cy="17" r="2"/><path d="M14 26 L26 26"/>',
  4: '<circle class="dot" cx="14.5" cy="17" r="2"/><circle class="dot" cx="25.5" cy="17" r="2"/><path d="M13.5 24 Q20 30.5 26.5 24"/>',
  5: '<path d="M11.5 18.5 Q14.5 14 17.5 18.5 M22.5 18.5 Q25.5 14 28.5 18.5"/><path class="solid" d="M12 23 Q20 34.5 28 23 Z"/>',
};

function faceSvg(mood, cls = '') {
  return `<svg class="face ${cls}" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="19" fill="var(--mood-${mood})"/><g fill="none" stroke="var(--face-ink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${FACE_PARTS[mood]}</g></svg>`;
}

const blankFace = `<svg class="face face-blank" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3.5 3.5"/><text x="20" y="25.5" text-anchor="middle" font-size="15" fill="currentColor">?</text></svg>`;

const ICONS = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L8 12 L15 19"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5 L16 12 L9 19"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15 L12 9 L18 15"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9 L12 15 L18 9"/></svg>',
};

function avatar(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return `<span class="avatar" style="--hue:${hash % 360}" aria-hidden="true">${escapeHtml([...name][0] ?? '?')}</span>`;
}

// ---- フォーム ----

function renderMoodPicker() {
  $('mood-picker').innerHTML = MOODS.map(
    (m) => `<label class="mood-option" style="--c: var(--mood-${m.value})">
      <input type="radio" name="mood" value="${m.value}">
      ${faceSvg(m.value)}
      <span class="mood-label">${m.label}</span>
    </label>`,
  ).join('');
}

function updateComposerFace() {
  const mood = Number(new FormData(form).get('mood')) || null;
  $('composer-face').innerHTML = mood ? faceSvg(mood, 'pop') : blankFace;
  if (mood) form.dataset.mood = String(mood);
  else delete form.dataset.mood;
}

function updateCounter() {
  const length = [...form.elements.namedItem('note').value.trim()].length;
  const counter = $('note-counter');
  counter.textContent = `${length} / ${LIMITS.note}`;
  counter.classList.toggle('is-over', length > LIMITS.note);
}

function renderMembers() {
  const names = knownMembers(state.entries);
  $('member-list').innerHTML = names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join('');
  $('member-chips').innerHTML = names
    .slice(0, 6)
    .map((n) => `<button type="button" class="chip" data-member="${escapeHtml(n)}">${avatar(n)}${escapeHtml(n)}</button>`)
    .join('');
}

function controlsOf(field) {
  if (field === 'mood') return [...form.querySelectorAll('input[name="mood"]')];
  return [form.elements.namedItem(field)];
}

function renderErrors() {
  for (const field of FIELDS) {
    const message = state.errors[field] ?? '';
    const wrap = form.querySelector(`[data-field="${field}"]`);
    wrap.classList.toggle('invalid', Boolean(message));
    wrap.querySelector('[data-error-for]').textContent = message;
    for (const el of controlsOf(field)) {
      if (message) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
    }
  }

  const summary = $('error-summary');
  const invalid = FIELDS.filter((f) => state.errors[f]);
  summary.hidden = invalid.length === 0;
  summary.innerHTML = invalid.length
    ? `<strong>入力内容を確認してください（${invalid.length}件）</strong><ul>${invalid
        .map((f) => `<li><a href="#" data-focus="${f}">${escapeHtml(state.errors[f])}</a></li>`)
        .join('')}</ul>`
    : '';
}

function focusField(field) {
  const controls = controlsOf(field);
  (controls.find((c) => c.checked) ?? controls[0])?.focus();
}

function resetForm(keepName) {
  form.reset();
  form.elements.namedItem('name').value = keepName;
  const date = form.elements.namedItem('date');
  date.value = todayKey();
  date.max = todayKey();
  state.errors = {};
  renderErrors();
  updateComposerFace();
  updateCounter();
}

function submitEntry() {
  const data = new FormData(form);
  const result = validateEntry(
    { name: data.get('name'), date: data.get('date'), mood: data.get('mood'), note: data.get('note') },
    { today: todayKey() },
  );
  state.errors = result.errors;
  renderErrors();
  if (!result.ok) {
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
    focusField(FIELDS.find((f) => result.errors[f]));
    return;
  }

  const { entries, entry, replaced } = upsertEntry(state.entries, result.value, {
    id: makeId(),
    now: new Date().toISOString(),
  });
  commit(entries);
  state.week = startOfWeek(entry.date);
  state.flashId = entry.id;
  resetForm(entry.name);
  render();
  toast(
    replaced
      ? `${entry.name}さんの${fmtWithDow(entry.date)}の記録を上書きしました`
      : `${entry.name}さんの気分を記録しました`,
  );
}

// ---- ダッシュボード ----

function emptyAllHtml() {
  return `<article class="card empty-hero">
    <div class="empty-faces">${MOODS.map((m) => faceSvg(m.value)).join('')}</div>
    <h2>まだ記録がありません</h2>
    <p>メンバーが毎日の気分を記録すると、ここに週ごとの傾向があらわれます。<br>まずは今日の気分をひとつ、記録してみましょう。</p>
    <div class="empty-actions">
      <button type="button" class="btn btn-primary" data-action="focus-form">今日の気分を記録する</button>
      <button type="button" class="btn btn-ghost" data-action="sample">サンプルデータで試す</button>
    </div>
    <ol class="empty-steps">
      <li><b>1</b>名前と気分を選ぶ</li>
      <li><b>2</b>ひとことを添える</li>
      <li><b>3</b>週の傾向を眺める</li>
    </ol>
  </article>`;
}

function weekNavHtml(s, today) {
  const thisWeek = startOfWeek(today);
  const ago = weeksBetween(thisWeek, s.start);
  const relative = ago === 0 ? '今週' : ago === 1 ? '先週' : `${ago}週間前`;
  const [y1, m1] = ymd(s.start);
  const [, m2, d2] = ymd(s.end);
  const range = m1 === m2 ? `${fmtMonthDay(s.start)} – ${d2}日` : `${fmtMonthDay(s.start)} – ${fmtMonthDay(s.end)}`;
  return `<header class="week-nav">
    <button type="button" class="icon-btn" data-action="prev-week" aria-label="前の週">${ICONS.prev}</button>
    <div class="week-title">
      <p class="eyebrow">${relative} · ${y1}年</p>
      <h2>${range}</h2>
    </div>
    <button type="button" class="icon-btn" data-action="next-week" aria-label="次の週" ${ago <= 0 ? 'disabled' : ''}>${ICONS.next}</button>
    ${ago > 0 ? '<button type="button" class="btn btn-ghost btn-small" data-action="this-week">今週へ</button>' : ''}
  </header>`;
}

function statsHtml(s, point) {
  const mood = moodOf(s.average);
  let delta = '<p class="stat-value is-muted">—</p><p class="stat-sub">この週の記録なし</p>';
  if (s.average !== null && point.delta === null) {
    delta = '<p class="stat-value is-muted">—</p><p class="stat-sub">前週の記録なし</p>';
  } else if (point.delta !== null) {
    const shown = Math.round(point.delta * 10) / 10;
    const dir = shown > 0 ? 'up' : shown < 0 ? 'down' : 'flat';
    const sign = shown > 0 ? '+' : shown < 0 ? '−' : '±';
    delta = `<p class="stat-value delta is-${dir}">${dir === 'flat' ? '' : ICONS[dir]}${sign}${Math.abs(shown).toFixed(1)}</p>
      <p class="stat-sub">前週 ${fmtAvg(Math.round((s.average - point.delta) * 100) / 100)} → ${fmtAvg(s.average)}</p>`;
  }
  const best = s.bestDay
    ? `<p class="stat-value">${WEEKDAYS[dayOfWeek(s.bestDay.date)]}曜</p><p class="stat-sub">${fmtShort(s.bestDay.date)} · 平均 ${fmtAvg(s.bestDay.average)}</p>`
    : '<p class="stat-value is-muted">—</p><p class="stat-sub">記録なし</p>';

  return `<div class="stats">
    <article class="stat stat-main" style="--c: var(--mood-${mood ?? 3})">
      <div class="stat-face">${mood ? faceSvg(mood) : blankFace}</div>
      <div>
        <p class="stat-label">週の平均</p>
        <p class="stat-value big">${fmtAvg(s.average)}<small>/ 5</small></p>
        <p class="stat-sub">${mood ? moodLabel(mood) : 'まだ記録がありません'}</p>
      </div>
    </article>
    <article class="stat"><p class="stat-label">前週比</p>${delta}</article>
    <article class="stat"><p class="stat-label">記録</p><p class="stat-value">${s.count}<small>件</small></p><p class="stat-sub">${s.members.length}人が参加</p></article>
    <article class="stat"><p class="stat-label">いちばん良かった日</p>${best}</article>
  </div>`;
}

function cellHtml(entry, date, name, today) {
  if (entry) {
    const head = `${name}・${fmtWithDow(date)}・${moodLabel(entry.mood)}`;
    return `<span role="cell"><button type="button" class="hm-cell" style="--c: var(--mood-${entry.mood})" data-entry-id="${entry.id}" data-tip-head="${escapeHtml(head)}" data-tip="${escapeHtml(entry.note)}" aria-label="${escapeHtml(`${head}：${entry.note}`)}">${faceSvg(entry.mood, 'mini')}</button></span>`;
  }
  const future = date > today;
  return `<span role="cell"><span class="hm-cell ${future ? 'is-future' : 'is-empty'}" aria-label="${escapeHtml(`${name}・${fmtWithDow(date)}・${future ? 'これから' : '記録なし'}`)}"></span></span>`;
}

const avgBadge = (avg) =>
  avg === null ? '<span class="avg-badge is-empty">—</span>' : `<span class="avg-badge" style="--c: var(--mood-${moodOf(avg)})">${fmtAvg(avg)}</span>`;

function heatmapHtml(s, today) {
  const head = s.days
    .map((d) => {
      const cls = [d === today && 'is-today', dayOfWeek(d) >= 5 && 'is-weekend'].filter(Boolean).join(' ');
      return `<span role="columnheader" class="hm-day ${cls}"><b>${WEEKDAYS[dayOfWeek(d)]}</b><small>${ymd(d)[2]}</small></span>`;
    })
    .join('');
  const rows = s.members
    .map(
      (m) => `<div class="hm-row" role="row">
        <span role="rowheader" class="hm-name" title="${escapeHtml(m.name)}">${avatar(m.name)}<span>${escapeHtml(m.name)}</span></span>
        ${m.days.map((e, i) => cellHtml(e, s.days[i], m.name, today)).join('')}
        <span role="cell" class="hm-avg">${avgBadge(m.average)}</span>
      </div>`,
    )
    .join('');
  const team = s.byDay
    .map(
      (d) =>
        `<span role="cell" class="hm-team">${d.average === null ? '<i class="team-dot is-empty"></i>' : `<i class="team-dot" style="--c: var(--mood-${moodOf(d.average)})"></i>${fmtAvg(d.average)}`}</span>`,
    )
    .join('');

  return `<article class="card">
    <header class="card-head"><h3>メンバー × 曜日</h3><p class="muted">マスを押す（カーソルを合わせる）と、ひとことが見られます</p></header>
    <div class="heatmap" role="table" aria-label="メンバーごとの気分">
      <div class="hm-row hm-head" role="row"><span role="columnheader" class="hm-name">メンバー</span>${head}<span role="columnheader" class="hm-avg">平均</span></div>
      ${rows}
      <div class="hm-row hm-foot" role="row"><span role="rowheader" class="hm-name">チーム</span>${team}<span role="cell" class="hm-avg">${avgBadge(s.average)}</span></div>
    </div>
  </article>`;
}

function distributionHtml(s) {
  const segments = s.distribution
    .map((n, i) =>
      n ? `<span class="dist-seg" style="flex-grow:${n}; --c: var(--mood-${i + 1})" title="${MOODS[i].label} ${n}件"></span>` : '',
    )
    .join('');
  const legend = MOODS.map((m, i) => {
    const n = s.distribution[i];
    const pct = Math.round((n / s.count) * 100);
    return `<li class="${n ? '' : 'is-zero'}">${faceSvg(m.value, 'tiny')}<span>${m.label}</span><b>${n}</b><small>${pct}%</small></li>`;
  }).join('');
  return `<article class="card">
    <header class="card-head"><h3>気分の分布</h3><p class="muted">${s.count}件の内訳</p></header>
    <div class="dist-bar" role="img" aria-label="${escapeHtml(MOODS.map((m, i) => `${m.label}${s.distribution[i]}件`).join('、'))}">${segments}</div>
    <ul class="dist-legend">${legend}</ul>
  </article>`;
}

function trendHtml(points) {
  const columns = points
    .map((p) => {
      const selected = p.start === state.week;
      const mood = moodOf(p.average);
      const label = p.average === null ? '記録なし' : `平均${fmtAvg(p.average)}（${p.count}件）`;
      return `<button type="button" class="trend-col ${selected ? 'is-selected' : ''} ${p.average === null ? 'is-empty' : ''}" data-week="${p.start}" aria-pressed="${selected}" aria-label="${fmtMonthDay(p.start)}からの週：${label}">
        <span class="trend-value">${fmtAvg(p.average)}</span>
        <span class="trend-track"><span class="trend-bar" style="--h: ${p.average === null ? 0 : (p.average / 5) * 100}%; --c: var(--mood-${mood ?? 3})"></span></span>
        <span class="trend-label">${fmtShort(p.start)}</span>
      </button>`;
    })
    .join('');
  return `<article class="card">
    <header class="card-head"><h3>8週間の推移</h3><p class="muted">週の平均。棒を押すとその週へ移動します</p></header>
    <div class="trend">${columns}</div>
  </article>`;
}

function entriesHtml(s, today) {
  const dates = [...new Set(s.entries.map((e) => e.date))];
  const groups = dates
    .map((date) => {
      const items = s.entries
        .filter((e) => e.date === date)
        .map(
          (e) => `<li class="entry" data-entry-id="${e.id}" style="--c: var(--mood-${e.mood})">
            ${faceSvg(e.mood, 'entry-face')}
            <div class="entry-body">
              <p class="entry-meta"><b>${escapeHtml(e.name)}</b><span class="tag">${moodLabel(e.mood)}</span></p>
              <p class="entry-note">${escapeHtml(e.note)}</p>
            </div>
            <button type="button" class="icon-btn icon-btn-quiet" data-action="delete" data-id="${e.id}" aria-label="${escapeHtml(`${e.name}さんの${fmtWithDow(e.date)}の記録を削除`)}">${ICONS.trash}</button>
          </li>`,
        )
        .join('');
      return `<section class="day-group">
        <h4 class="day-label">${fmtWithDow(date)}${date === today ? '<span class="pill">今日</span>' : ''}</h4>
        <ul class="entries">${items}</ul>
      </section>`;
    })
    .join('');
  return `<article class="card">
    <header class="card-head"><h3>ひとこと</h3><p class="muted">${s.count}件</p></header>
    ${groups}
  </article>`;
}

function weekEmptyHtml(s, today) {
  const isCurrent = s.start === startOfWeek(today);
  return `<article class="card week-empty">
    ${blankFace}
    <h3>この週の記録はまだありません</h3>
    <p class="muted">${isCurrent ? '今日の気分を記録して、今週をはじめましょう。' : 'この週の日付を選んで、あとから記録することもできます。'}</p>
    <button type="button" class="btn btn-ghost" data-action="record-in-week">${isCurrent ? '今日の気分を記録する' : 'この週の日付で記録する'}</button>
  </article>`;
}

function renderDashboard() {
  hideTip();
  if (state.entries.length === 0) {
    dashboard.innerHTML = emptyAllHtml();
    return;
  }
  const today = todayKey();
  const summary = summarizeWeek(state.entries, state.week);
  const trend = weeklyTrend(state.entries, state.week, 8);
  const body = summary.count
    ? `${heatmapHtml(summary, today)}<div class="split">${distributionHtml(summary)}${trendHtml(trend)}</div>${entriesHtml(summary, today)}`
    : `${weekEmptyHtml(summary, today)}${trendHtml(trend)}`;
  dashboard.innerHTML = `${weekNavHtml(summary, today)}${statsHtml(summary, trend.at(-1))}${body}`;

  if (state.flashId) {
    dashboard.querySelectorAll(`[data-entry-id="${state.flashId}"]`).forEach((el) => el.classList.add('flash'));
    state.flashId = null;
  }
}

function render() {
  renderMembers();
  renderDashboard();
}

// ---- 保存・通知 ----

function commit(entries) {
  state.entries = entries;
  if (!store.save(entries)) {
    showBanner('このブラウザに保存できませんでした。ページを閉じると、いまの記録は消えてしまいます。', 'warn');
  }
}

function showBanner(message, tone) {
  const banner = $('banner');
  banner.textContent = message;
  banner.dataset.tone = tone;
  banner.hidden = false;
}

function toast(message, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  };
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      dismiss();
      action.run();
    });
    el.append(button);
  }
  $('toast-region').replaceChildren(el);
  const timer = setTimeout(dismiss, action ? 7000 : 3500);
}

// ---- ツールチップ ----

function showTip(target) {
  tooltip.innerHTML = `<strong>${escapeHtml(target.dataset.tipHead)}</strong><span>${escapeHtml(target.dataset.tip)}</span>`;
  tooltip.hidden = false;
  const r = target.getBoundingClientRect();
  const t = tooltip.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
  const top = r.top - t.height - 10 < 8 ? r.bottom + 10 : r.top - t.height - 10;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTip() {
  tooltip.hidden = true;
}

// ---- 操作 ----

let clearTimer = null;

const actions = {
  'prev-week': () => goToWeek(addDays(state.week, -7)),
  'next-week': () => goToWeek(addDays(state.week, 7)),
  'this-week': () => goToWeek(startOfWeek(todayKey())),
  'focus-form': () => focusField('name'),
  'record-in-week': () => {
    const today = todayKey();
    const end = addDays(state.week, 6);
    form.elements.namedItem('date').value = end < today ? end : today;
    focusField(form.elements.namedItem('name').value ? 'mood' : 'name');
  },
  sample: () => {
    const now = new Date().toISOString();
    commit(createSampleEntries({ today: todayKey(), makeId, now }));
    render();
    toast('サンプルデータを読み込みました。「すべて消去」でいつでも消せます');
  },
  delete: (button) => {
    const { entries, removed } = removeEntry(state.entries, button.dataset.id);
    if (!removed) return;
    commit(entries);
    render();
    toast(`${removed.name}さんの${fmtWithDow(removed.date)}の記録を削除しました`, {
      label: '元に戻す',
      run: () => {
        const result = restoreEntry(state.entries, removed);
        if (!result.restored) {
          toast('同じ日の記録が新しく作られているため、元に戻せませんでした');
          return;
        }
        commit(result.entries);
        state.week = startOfWeek(removed.date);
        state.flashId = removed.id;
        render();
      },
    });
  },
  export: () => {
    const blob = new Blob([serialize(state.entries)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `team-mood-log-${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  clear: (button) => {
    if (state.entries.length === 0) {
      toast('消去する記録はありません');
      return;
    }
    if (!button.classList.contains('is-armed')) {
      button.classList.add('is-armed');
      button.textContent = 'もう一度押すと消去します';
      clearTimer = setTimeout(() => disarmClear(button), 4000);
      return;
    }
    disarmClear(button);
    const backup = state.entries;
    commit([]);
    render();
    toast(`${backup.length}件の記録を消去しました`, {
      label: '元に戻す',
      run: () => {
        commit(backup);
        render();
      },
    });
  },
};

function disarmClear(button) {
  clearTimeout(clearTimer);
  button.classList.remove('is-armed');
  button.textContent = 'すべて消去';
}

function goToWeek(week) {
  const thisWeek = startOfWeek(todayKey());
  state.week = week > thisWeek ? thisWeek : week;
  renderDashboard();
}

document.addEventListener('click', (event) => {
  const actionEl = event.target.closest('[data-action]');
  if (actionEl && !actionEl.disabled) {
    actions[actionEl.dataset.action]?.(actionEl);
    return;
  }
  const weekEl = event.target.closest('[data-week]');
  if (weekEl) {
    goToWeek(weekEl.dataset.week);
    return;
  }
  const memberEl = event.target.closest('[data-member]');
  if (memberEl) {
    form.elements.namedItem('name').value = memberEl.dataset.member;
    delete state.errors.name;
    renderErrors();
    focusField('mood');
    return;
  }
  const focusEl = event.target.closest('[data-focus]');
  if (focusEl) {
    event.preventDefault();
    focusField(focusEl.dataset.focus);
    return;
  }
  const tipEl = event.target.closest('[data-tip]');
  if (tipEl) showTip(tipEl);
  else hideTip();
});

dashboard.addEventListener('mouseover', (event) => {
  const el = event.target.closest('[data-tip]');
  if (el) showTip(el);
});
dashboard.addEventListener('mouseout', (event) => {
  if (event.target.closest('[data-tip]') && !event.relatedTarget?.closest?.('[data-tip]')) hideTip();
});
dashboard.addEventListener('focusin', (event) => {
  const el = event.target.closest('[data-tip]');
  if (el) showTip(el);
});
dashboard.addEventListener('focusout', hideTip);
window.addEventListener('scroll', hideTip, { passive: true });

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideTip();
  if (event.target.closest('input, textarea, select, [contenteditable]')) return;
  if (state.entries.length === 0) return;
  if (event.key === 'ArrowLeft') actions['prev-week']();
  if (event.key === 'ArrowRight') actions['next-week']();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  submitEntry();
});

form.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener('input', (event) => {
  const field = event.target.name;
  if (field === 'note') updateCounter();
  if (field === 'mood') updateComposerFace();
  if (state.errors[field]) {
    delete state.errors[field];
    renderErrors();
  }
});

form.addEventListener('animationend', () => form.classList.remove('shake'));

// ---- 起動 ----

const today = todayKey();
const [ty, tm, td] = ymd(today);
$('today').innerHTML = `<span>${ty}年</span>${tm}月${td}日<span>（${WEEKDAYS[dayOfWeek(today)]}）</span>`;

if (loaded.unavailable) {
  showBanner('このブラウザでは記録を保存できません（プライベートモードなど）。ページを閉じると記録は消えます。', 'warn');
} else if (loaded.recovered) {
  showBanner('保存データの一部が読み込めなかったため、読める記録だけを表示しています。', 'info');
}

renderMoodPicker();
resetForm(knownMembers(state.entries)[0] ?? '');
render();
