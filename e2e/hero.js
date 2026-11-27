// docs/test-spec.md の全テストケースを実行し、1 ケース 1 本の動画を撮る「ヒーロースクリプト」。
// Playwright CLI 公式 skill（.claude/skills/playwright-cli/references/video-recording.md）の
// 「Record entire hero scripts」に沿って、playwright-cli run-code --filename で実行する。
// e2e/run-e2e.sh が __CONFIG__ を実際の設定に置き換えてから実行する。
// run-code 1 回あたりの時間に上限があるため、CONFIG.only で指定したケースだけを実行し、仕様書の節ごとに分けて呼ぶ。
// run-code は require / process が使えない隔離環境なので、ここでは Playwright の page だけを使う。
async page => {
  const CONFIG = __CONFIG__;
  const STORAGE_KEY = 'team-mood-log/v1';
  const results = [];
  let cur = null;

  // ---- 小さな道具 ----

  const sleep = (ms) => page.waitForTimeout(ms);
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const record = (label, pass, actual) => {
    cur.checks.push({ label, pass: Boolean(pass), actual: pass ? null : String(actual) });
  };

  /** ページ内で関数を評価し、true なら OK */
  const check = async (label, fn, arg) => {
    let value;
    try {
      value = await page.evaluate(fn, arg);
    } catch (e) {
      value = `エラー: ${e.message.split('\n')[0]}`;
    }
    record(label, value === true, value);
  };

  /** 要素のテキストに want が含まれていれば OK */
  const checkText = async (label, selector, want) => {
    const value = await page
      .locator(selector)
      .first()
      .textContent({ timeout: 2000 })
      .then((t) => t.replace(/\s+/g, ' ').trim())
      .catch(() => '(要素なし)');
    record(label, value.includes(want), value);
  };

  const entryCount = () => page.locator('.entry').count();
  const storedCount = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{"entries":[]}').entries.length, STORAGE_KEY);

  // ---- 画面の操作（ロケータは役割・ラベルで指定する） ----

  const nameInput = page.getByLabel('名前');
  const dateInput = page.getByLabel('日付');
  const noteInput = page.getByLabel('ひとこと');
  const submitButton = page.getByRole('button', { name: '記録する', exact: true });
  const toast = page.locator('.toast');
  const undoButton = page.getByRole('button', { name: '元に戻す' });

  const typeInto = async (input, text) => {
    await input.fill('');
    await input.pressSequentially(text, { delay: 70 });
  };
  const pickMood = (label) => page.locator('label.mood-option', { hasText: label }).click();

  // 前提づくり（録画の前に行う）
  const fresh = async () => {
    await page.goto(CONFIG.baseUrl);
    await page.evaluate(() => localStorage.clear());
    await page.goto(CONFIG.baseUrl);
  };
  const withSample = async () => {
    await fresh();
    await page.getByRole('button', { name: 'サンプルデータで試す' }).click();
    await sleep(300);
  };

  // 次のケースへ状態を引き継ぐ間（録画の切り替え中）に、トーストや確認表示が時間切れで消えないようにする
  const freezeTimers = async () => page.clock.pauseAt(await page.evaluate(() => Date.now() + 1));
  const unfreezeTimers = () => page.clock.resume();

  // ---- テストケースの枠組み ----

  const showActions = () =>
    page.screencast.showActions({
      duration: 600,
      position: 'top-right',
      style: {
        point: 'width: 18px; height: 18px; border-radius: 50%; background: rgba(228, 87, 46, .75)',
        highlight: 'outline: 3px solid #e4572e; outline-offset: 2px; border-radius: 6px',
        title: 'font-size: 14px',
      },
    });

  /** 確認項目の結果を動画の右下に出す */
  async function showChecks() {
    const okAll = !cur.error && cur.checks.every((c) => c.pass);
    const items = cur.checks
      .map((c) => `<li style="margin: 2px 0">${c.pass ? '✅' : '❌'} ${escapeHtml(c.label)}</li>`)
      .join('');
    const error = cur.error ? `<p style="margin: 6px 0 0; color: #ffb4a8">操作に失敗: ${escapeHtml(cur.error)}</p>` : '';
    await page.screencast.showOverlay(
      `<div style="position: absolute; right: 16px; bottom: 16px; max-width: 360px; padding: 12px 16px;
        background: rgba(20, 20, 20, .86); color: #fff; border-radius: 12px; font: 13px/1.5 system-ui, sans-serif;
        box-shadow: 0 8px 24px rgba(0,0,0,.3)">
        <p style="margin: 0 0 4px; font-weight: 700; font-size: 15px">${escapeHtml(cur.id)} 確認結果:
          <span style="color: ${okAll ? '#7ee787' : '#ff7b72'}">${okAll ? 'OK' : 'NG'}</span></p>
        <ul style="margin: 0; padding: 0; list-style: none">${items}</ul>${error}
      </div>`,
      { duration: 2600 },
    );
    await sleep(2600);
  }

  /**
   * 1 つのテストケースを録画しながら実行する。
   * setup: 'fresh'（記録なし）/ 'sample'（サンプルデータ）/ null（前のケースの続き）
   */
  async function tc(id, slug, title, steps, { setup = 'fresh', size = CONFIG.size } = {}, body) {
    if (!CONFIG.only.includes(id)) return;
    cur = { id, title, video: `${id}_${slug}.webm`, checks: [], error: null };
    results.push(cur);
    try {
      await page.setViewportSize(size);
      if (setup === 'fresh') await fresh();
      if (setup === 'sample') await withSample();
      await page.screencast.start({ path: `${CONFIG.videoDir}/${cur.video}`, size });
      await showActions();
      await page.screencast.showChapter(`${id}　${title}`, { description: steps, duration: 1800 });
      await body();
      await sleep(600);
    } catch (e) {
      cur.error = e.message.split('\n')[0];
    }
    try {
      await showChecks();
    } finally {
      await page.screencast.stop().catch(() => {});
    }
  }

  // ---- 準備 ----

  if (CONFIG.first) {
    await page.clock.install({ time: new Date(CONFIG.now) });
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }

  // =====================================================================
  // 4.1 初期表示
  // =====================================================================

  await tc('TC-01', 'initial-empty', '初回表示（記録なし）', 'トップページを開く', {}, async () => {
    await sleep(800);
    await checkText('ヘッダーに今日の日付', '#today', '2026年11月20日（金）');
    await checkText('「まだ記録がありません」の案内', '.empty-hero h2', 'まだ記録がありません');
    record('「サンプルデータで試す」ボタンがある', await page.getByRole('button', { name: 'サンプルデータで試す' }).isVisible(), '見えない');
    record('日付欄に今日の日付', (await dateInput.inputValue()) === '2026-11-20', await dateInput.inputValue());
  });

  await tc('TC-02', 'sample-data', 'サンプルデータを読み込む', '「サンプルデータで試す」を押す', {}, async () => {
    await page.getByRole('button', { name: 'サンプルデータで試す' }).click();
    await checkText('トーストが出る', '.toast', 'サンプルデータを読み込みました');
    await checkText('今週が表示される', '.week-title h2', '11月16日 – 22日');
    await check('集計カードが 4 枚出る', () => document.querySelectorAll('.stats .stat').length === 4);
    await check('マス目にメンバーの行がある', () => document.querySelectorAll('.heatmap .hm-row:not(.hm-head):not(.hm-foot)').length >= 3);
    await check('メンバーのチップが出る', () => document.querySelectorAll('#member-chips .chip').length >= 3);
    await page.mouse.wheel(0, 700);
    await sleep(1200);
    await page.mouse.wheel(0, -700);
  });

  await tc('TC-03', 'focus-form', '「今日の気分を記録する」で名前欄へ', '空の案内の「今日の気分を記録する」を押す', {}, async () => {
    await page.getByRole('button', { name: '今日の気分を記録する' }).click();
    await check('名前欄にフォーカス', () => document.activeElement?.id === 'f-name');
  });

  // =====================================================================
  // 4.2 記録の入力
  // =====================================================================

  await tc('TC-04', 'mood-selected', '気分の選択', '気分「最高」を押す', {}, async () => {
    await pickMood('最高');
    await check('「最高」が選択されている', () => document.querySelector('input[name=mood]:checked')?.value === '5');
    await check('フォーム上部の顔が「最高」になる', () => document.getElementById('entry-form').dataset.mood === '5' && !document.querySelector('#composer-face .face-blank'));
  });

  await tc('TC-05', 'mood-unselected', '気分の選択解除（もう一度押す）', '選択中の「最高」をもう一度押す', { setup: null }, async () => {
    await pickMood('最高');
    await check('選択が外れる', () => !document.querySelector('input[name=mood]:checked'));
    await check('顔が「?」に戻る', () => Boolean(document.querySelector('#composer-face .face-blank')));
  });

  await tc('TC-06', 'note-counter', 'ひとことの文字数カウンター', 'ひとことに「ペアプロが楽しかった」(10文字) を入力', {}, async () => {
    await typeInto(noteInput, 'ペアプロが楽しかった');
    await checkText('カウンターが 10 / 80', '#note-counter', '10 / 80');
  });

  await tc('TC-07', 'entry-added', '記録の登録', '名前「あおい」・気分「いい感じ」・ひとことを入れて「記録する」', {}, async () => {
    await typeInto(nameInput, 'あおい');
    await pickMood('いい感じ');
    await typeInto(noteInput, 'ペアプロが楽しかった');
    await submitButton.click();
    await checkText('トーストが出る', '.toast', 'あおいさんの気分を記録しました');
    await check('マス目の金曜に「あおい」の記録', () => [...document.querySelectorAll('.hm-cell[data-tip-head]')].some((c) => c.dataset.tipHead.startsWith('あおい・11/20（金）・いい感じ')));
    record('ひとこと一覧に 1 件', (await entryCount()) === 1, await entryCount());
    await checkText('ひとことが出る', '.entry-note', 'ペアプロが楽しかった');
    await check('フォームがリセットされ名前だけ残る', () => document.getElementById('f-name').value === 'あおい' && document.getElementById('f-note').value === '' && !document.querySelector('input[name=mood]:checked'));
    await page.locator('.entry').first().scrollIntoViewIfNeeded();
    await sleep(800);
  });

  await tc('TC-08', 'entry-overwritten', '同じ人・同じ日の上書き', '名前「あおい」のまま気分「最高」で「記録する」', { setup: null }, async () => {
    await page.mouse.wheel(0, -2000);
    await pickMood('最高');
    await submitButton.click();
    await checkText('上書きのトースト', '.toast', 'あおいさんの11/20（金）の記録を上書きしました');
    record('記録は 1 件のまま', (await entryCount()) === 1, await entryCount());
    await checkText('気分が「最高」になる', '.entry .tag', '最高');
    await page.locator('.entry').first().scrollIntoViewIfNeeded();
    await sleep(800);
  });

  await tc('TC-09', 'anonymous-entry', '名前なしの記録', '名前を空にして気分「ふつう」だけ選び「記録する」', {}, async () => {
    await nameInput.fill('');
    await pickMood('ふつう');
    await submitButton.click();
    await checkText('追加のトースト', '.toast', '11/20（金）の記録を追加しました');
    await checkText('一覧に「名前なし」で出る', '.entry-meta', '名前なし');
    await page.locator('.entry').first().scrollIntoViewIfNeeded();
    await sleep(800);
  });

  await tc('TC-10', 'ctrl-enter', '⌘/Ctrl + Enter で記録', 'ひとことにカーソルを置き Ctrl + Enter', {}, async () => {
    await typeInto(nameInput, 'あおい');
    await typeInto(noteInput, 'キーボードだけで記録');
    await noteInput.press('Control+Enter');
    await checkText('トーストが出る', '.toast', 'あおいさんの気分を記録しました');
    record('記録が 1 件', (await entryCount()) === 1, await entryCount());
  });

  await tc('TC-11', 'past-date', '過去の日付で記録', '日付 2026-11-17・気分「しんどい」で記録', {}, async () => {
    await typeInto(nameInput, 'あおい');
    await dateInput.fill('2026-11-17');
    await pickMood('しんどい');
    await submitButton.click();
    await check('火曜（11/17）のマスに記録', () => Boolean(document.querySelector('.hm-cell[data-tip-head^="あおい・11/17（火）・しんどい"]')));
    await checkText('一覧の日付が 11/17（火）', '.day-label', '11/17（火）');
  });

  await tc('TC-12', 'member-chip', 'メンバーのチップで名前を入れる', '名前を空にしてチップ「ゆい」を押す', { setup: 'sample' }, async () => {
    await nameInput.fill('');
    await page.locator('#member-chips').getByRole('button', { name: 'ゆい', exact: true }).click();
    record('名前欄に「ゆい」', (await nameInput.inputValue()) === 'ゆい', await nameInput.inputValue());
    await check('気分の選択肢にフォーカス', () => document.activeElement?.name === 'mood');
  });

  // =====================================================================
  // 4.3 入力エラー
  // =====================================================================

  await tc('TC-13', 'error-empty', 'すべて空で送信', '何も入力せず「記録する」', {}, async () => {
    await nameInput.fill('');
    await submitButton.click();
    await checkText('エラーまとめが出る', '#error-summary', '入力内容を確認してください（1件）');
    await checkText('気分欄のエラー', '#e-mood', '名前・気分・ひとことのどれかを入力してください');
    await check('記録は増えない', () => Boolean(document.querySelector('.empty-hero')));
  });

  await tc('TC-14', 'error-note-too-long', 'ひとことの文字数オーバー', 'ひとことに 81 文字入力して「記録する」', {}, async () => {
    await noteInput.pressSequentially('あ'.repeat(81), { delay: 12 });
    await check('81 / 80 が警告表示', () => {
      const c = document.getElementById('note-counter');
      return c.textContent === '81 / 80' && c.classList.contains('is-over');
    });
    await submitButton.click();
    await checkText('ひとことのエラー', '#e-note', 'ひとことは80文字以内にしてください（いま81文字）');
    record('ひとこと欄が aria-invalid', (await noteInput.getAttribute('aria-invalid')) === 'true', await noteInput.getAttribute('aria-invalid'));
  });

  await tc('TC-15', 'error-name-too-long', '名前の文字数オーバー', '名前に 21 文字入力し気分を選んで「記録する」', {}, async () => {
    await nameInput.fill('');
    await nameInput.pressSequentially('な'.repeat(21), { delay: 30 });
    await pickMood('ふつう');
    await submitButton.click();
    await checkText('名前のエラー', '#e-name', '名前は20文字以内で入力してください');
    await check('記録は増えない', () => Boolean(document.querySelector('.empty-hero')));
  });

  await tc('TC-16', 'error-future-date', '未来の日付', '日付 2026-11-21・気分を選んで「記録する」', {}, async () => {
    await typeInto(nameInput, 'あおい');
    await dateInput.fill('2026-11-21');
    await pickMood('いい感じ');
    await submitButton.click();
    await checkText('日付のエラー', '#e-date', '未来の日付には記録できません');
    await check('記録は増えない', () => Boolean(document.querySelector('.empty-hero')));
  });

  await tc('TC-17', 'error-cleared', 'エラーまとめのリンクとエラーの解消', 'エラーまとめのリンクを押し、日付を直す', { setup: null }, async () => {
    await page.locator('#error-summary a').click();
    await check('リンクで日付欄にフォーカス', () => document.activeElement?.id === 'f-date');
    await dateInput.fill('2026-11-20');
    await check('日付のエラー表示が消える', () => document.getElementById('e-date').textContent === '' && !document.querySelector('[data-field=date]').classList.contains('invalid'));
    await check('エラーまとめが閉じる', () => document.getElementById('error-summary').hidden);
  });

  // =====================================================================
  // 4.4 週の表示
  // =====================================================================

  await tc('TC-18', 'tooltip', 'マスにカーソルでツールチップ', 'マス目の記録のあるマスにカーソルを合わせる', { setup: 'sample' }, async () => {
    const cell = page.locator('button.hm-cell[data-tip]:not([data-tip=""])').first();
    await cell.hover();
    await sleep(600);
    const head = await cell.getAttribute('data-tip-head');
    const tip = await cell.getAttribute('data-tip');
    record('ツールチップが出る', await page.locator('#tooltip').isVisible(), '見えない');
    const shown = await page.locator('#tooltip').textContent();
    record('ツールチップに名前・日付・ひとこと', shown.includes(head) && shown.includes(tip), shown);
    await sleep(800);
  });

  await tc('TC-19', 'prev-week', '前の週へ', '「前の週」ボタンを押す', { setup: 'sample' }, async () => {
    await page.getByRole('button', { name: '前の週' }).click();
    await checkText('見出しが「先週」', '.week-title .eyebrow', '先週 · 2026年');
    await checkText('期間が 11月9日 – 15日', '.week-title h2', '11月9日 – 15日');
    record(
      '「今週へ」が出て「次の週」が使える',
      (await page.getByRole('button', { name: '今週へ' }).isVisible()) && (await page.getByRole('button', { name: '次の週' }).isEnabled()),
      '条件を満たさない',
    );
  });

  await tc('TC-20', 'back-to-this-week', '今週へ戻る', '「今週へ」を押す', { setup: null }, async () => {
    await page.getByRole('button', { name: '今週へ' }).click();
    await checkText('今週に戻る', '.week-title h2', '11月16日 – 22日');
    record('「次の週」は無効', await page.getByRole('button', { name: '次の週' }).isDisabled(), '有効のまま');
  });

  await tc('TC-21', 'arrow-keys', '← → キーで週を移動', '← を 2 回、→ を 1 回、さらに → を 2 回押す', { setup: 'sample' }, async () => {
    await page.locator('h1').click();
    for (const key of ['ArrowLeft', 'ArrowLeft']) {
      await page.keyboard.press(key);
      await sleep(500);
    }
    await checkText('← 2 回で 2週間前', '.week-title .eyebrow', '2週間前');
    await page.keyboard.press('ArrowRight');
    await sleep(500);
    await checkText('→ 1 回で先週', '.week-title .eyebrow', '先週');
    for (const key of ['ArrowRight', 'ArrowRight']) {
      await page.keyboard.press(key);
      await sleep(500);
    }
    await checkText('今週より先には進まない', '.week-title .eyebrow', '今週');
  });

  await tc('TC-22', 'trend-click', '推移の棒でその週へ', '8週間の推移の左から 5 本目（10/26 の週）を押す', { setup: 'sample' }, async () => {
    const bar = page.getByRole('button', { name: /^10月26日からの週/ });
    await bar.scrollIntoViewIfNeeded();
    await bar.click();
    await bar.scrollIntoViewIfNeeded();
    await checkText('10月26日の週が表示される', '.week-title h2', '10月26日 – 11月1日');
    await check('その棒が選択状態', () => document.querySelector('.trend-col.is-selected')?.dataset.week === '2026-10-26');
  });

  await tc('TC-23', 'empty-week', '記録のない週', '推移のいちばん左（9/28 の週）を押す', { setup: 'sample' }, async () => {
    const bar = page.getByRole('button', { name: /^9月28日からの週/ });
    await bar.scrollIntoViewIfNeeded();
    await bar.click();
    await page.mouse.wheel(0, -2000);
    await checkText('9月28日の週が表示される', '.week-title h2', '9月28日 – 10月4日');
    await checkText('空の週の案内', '.week-empty h3', 'この週の記録はまだありません');
    record('「この週の日付で記録する」ボタン', await page.getByRole('button', { name: 'この週の日付で記録する' }).isVisible(), '見えない');
  });

  // =====================================================================
  // 4.5 削除・消去
  // =====================================================================

  let before = 0;
  let deletedId = null;
  await tc('TC-24', 'delete', '記録の削除', 'ひとこと一覧の先頭の記録のゴミ箱を押す', { setup: 'sample' }, async () => {
    before = await entryCount();
    const trash = page.locator('.entry').first().getByRole('button', { name: /を削除$/ });
    await trash.scrollIntoViewIfNeeded();
    deletedId = await trash.getAttribute('data-id');
    const label = await trash.getAttribute('aria-label');
    await trash.click();
    record(`記録が 1 件減る（${before} → ${before - 1}）`, (await entryCount()) === before - 1, await entryCount());
    await checkText('削除のトースト', '.toast', `${label}しました`);
    record('「元に戻す」がある', await undoButton.isVisible(), '見えない');
    await freezeTimers();
  });

  await tc('TC-25', 'delete-undo', '削除の取り消し', 'トーストの「元に戻す」を押す', { setup: null }, async () => {
    await undoButton.click();
    await unfreezeTimers();
    record(`件数が元に戻る（${before} 件）`, (await entryCount()) === before, await entryCount());
    record('削除した記録が戻る', (await page.locator(`li.entry[data-entry-id="${deletedId}"]`).count()) === 1, '見つからない');
    await page.locator(`li.entry[data-entry-id="${deletedId}"]`).scrollIntoViewIfNeeded();
    await sleep(600);
  });

  let total = 0;
  const clearButton = page.locator('[data-action=clear]');
  await tc('TC-26', 'clear-armed', 'すべて消去（1 回目は確認）', '「すべて消去」を 1 回押す', { setup: 'sample' }, async () => {
    total = await storedCount();
    await clearButton.scrollIntoViewIfNeeded();
    await clearButton.click();
    await checkText('ボタンが確認表示になる', '[data-action=clear]', 'もう一度押すと消去します');
    record('まだ記録は消えない', (await storedCount()) === total, await storedCount());
    await freezeTimers();
  });

  await tc('TC-27', 'clear-done', 'すべて消去（実行）', '4 秒以内にもう一度押す', { setup: null }, async () => {
    await clearButton.scrollIntoViewIfNeeded();
    await clearButton.click();
    await unfreezeTimers();
    await page.mouse.wheel(0, -2000);
    await checkText('「まだ記録がありません」に戻る', '.empty-hero h2', 'まだ記録がありません');
    await checkText(`消去のトースト（${total}件）`, '.toast', `${total}件の記録を消去しました`);
    record('保存データも空', (await storedCount()) === 0, await storedCount());
    await freezeTimers();
  });

  await tc('TC-28', 'clear-undo', 'すべて消去の取り消し', '「元に戻す」を押す', { setup: null }, async () => {
    await undoButton.click();
    await unfreezeTimers();
    record(`消去前の ${total} 件に戻る`, (await storedCount()) === total, await storedCount());
    record('ダッシュボードが戻る', await page.locator('.heatmap').isVisible(), '見えない');
  });

  // =====================================================================
  // 4.6 保存・読み込み・書き出し
  // =====================================================================

  await tc('TC-29', 'persist-reload', '再読み込み後も記録が残る', '記録を 1 件追加してページを再読み込み', {}, async () => {
    await typeInto(nameInput, 'あおい');
    await pickMood('いい感じ');
    await typeInto(noteInput, 'リロードしても残るはず');
    await submitButton.click();
    await sleep(600);
    await page.reload();
    await sleep(600);
    record('記録が残っている', (await entryCount()) === 1, await entryCount());
    await checkText('ひとことも残っている', '.entry-note', 'リロードしても残るはず');
    record('名前欄に最近のメンバーが入る', (await nameInput.inputValue()) === 'あおい', await nameInput.inputValue());
  });

  await tc('TC-30', 'broken-storage', '壊れた保存データ', 'localStorage に「読める記録 1 件 + 壊れた記録 1 件」を入れて再読み込み', {}, async () => {
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({
        version: 1,
        entries: [
          { id: 'ok-1', name: 'あおい', date: '2026-11-19', mood: 4, note: '読める記録', createdAt: '2026-11-19T01:00:00.000Z', updatedAt: '2026-11-19T01:00:00.000Z' },
          { id: 'broken-1', name: 'こわれ', date: '2026-02-30', mood: 9, note: 123 },
        ],
      }));
    }, STORAGE_KEY);
    await page.reload();
    await sleep(600);
    await checkText('バナーが出る', '#banner', '保存データの一部が読み込めなかったため、読める記録だけを表示しています。');
    record('読める 1 件だけ表示', (await entryCount()) === 1 && (await page.locator('.entry-note').textContent()) === '読める記録', await entryCount());
  });

  await tc('TC-31', 'export', 'JSON で書き出す', '「JSONで書き出す」を押す', { setup: 'sample' }, async () => {
    const exportButton = page.getByRole('button', { name: 'JSONで書き出す' });
    await exportButton.scrollIntoViewIfNeeded();
    // ダウンロードされる Blob の中身をページ側で控えておく（run-code ではファイルを読めないため）
    await page.evaluate(() => {
      const original = URL.createObjectURL;
      URL.createObjectURL = (blob) => {
        window.__exported = blob.text();
        return original.call(URL, blob);
      };
    });
    const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
    const filename = download.suggestedFilename();
    record(`ファイル名が ${filename}`, filename === 'team-mood-log-2026-11-20.json', filename);
    await download.saveAs(`${CONFIG.outputDir}/${filename}`);
    const data = JSON.parse(await page.evaluate(() => window.__exported));
    const stored = await storedCount();
    record(
      `中身が {version:1, entries} で ${data.entries?.length} 件（保存データと一致）`,
      data.version === 1 && Array.isArray(data.entries) && data.entries.length === stored,
      `書き出し ${data.entries?.length} / 保存 ${stored}`,
    );
    await page.screencast.showOverlay(
      `<div style="position: absolute; left: 16px; top: 16px; padding: 10px 14px; background: rgba(20,20,20,.86); color: #fff;
        border-radius: 10px; font: 13px/1.5 system-ui, sans-serif">⬇️ ダウンロード: ${escapeHtml(filename)}（${data.entries?.length} 件）</div>`,
      { duration: 1800 },
    );
    await sleep(1800);
  });

  const importFile = async (name) => {
    const importButton = page.getByRole('button', { name: 'JSONを読み込む' });
    await importButton.scrollIntoViewIfNeeded();
    // ボタンを押すとファイル選択ダイアログが開き、Playwright CLI がそれをモーダルとして横取りして run-code が止まる。
    // そのため動画ではボタンにカーソルを合わせて選んだファイル名を示し、ファイルはボタンの裏の input に直接渡す
    await importButton.hover();
    await page.screencast.showOverlay(
      `<div style="position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); padding: 14px 20px;
        background: rgba(20,20,20,.88); color: #fff; border-radius: 12px; font: 15px/1.5 system-ui, sans-serif">
        📂 ファイルを選択: <b>${escapeHtml(name)}</b></div>`,
      { duration: 1500 },
    );
    await sleep(1500);
    await page.locator('#import-file').setInputFiles(`${CONFIG.fixturesDir}/${name}`);
    await sleep(300);
  };

  let beforeImport = 0;
  await tc('TC-32', 'import', 'JSON を読み込む', '「JSONを読み込む」で import.json（新規 1 件 + さくらの今日の更新 1 件）を選ぶ', { setup: 'sample' }, async () => {
    beforeImport = await storedCount();
    await importFile('import.json');
    await checkText('トースト「1件を追加、1件を更新しました」', '.toast', '1件を追加、1件を更新しました');
    record(`件数が ${beforeImport} → ${beforeImport + 1}`, (await storedCount()) === beforeImport + 1, await storedCount());
    const minato = page.locator('.entry-meta b', { hasText: 'みなと' });
    record('「みなと」が増える', (await minato.count()) === 1, await minato.count());
    await check('さくらの今日のひとことが更新される', () => Boolean(document.querySelector('.hm-cell[data-tip-head^="さくら・11/20（金）・最高"][data-tip="読み込みで更新されたひとこと"]')));
    await minato.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(600);
    await freezeTimers();
  });

  await tc('TC-33', 'import-undo', '読み込みの取り消し', '「元に戻す」を押す', { setup: null }, async () => {
    await undoButton.click();
    await unfreezeTimers();
    record(`件数が ${beforeImport} 件に戻る`, (await storedCount()) === beforeImport, await storedCount());
    record('「みなと」が消える', (await page.locator('.entry-meta b', { hasText: 'みなと' }).count()) === 0, 'まだある');
  });

  await tc('TC-34', 'import-invalid', '読めないファイルを読み込む', 'not-mood-log.json を読み込む', { setup: 'sample' }, async () => {
    const count = await storedCount();
    await importFile('not-mood-log.json');
    await checkText('エラーのトースト', '.toast', '読み込めませんでした：気分ログの書き出しファイルではないようです');
    record('記録は変わらない', (await storedCount()) === count, await storedCount());
  });

  // =====================================================================
  // 4.7 見た目
  // =====================================================================

  await tc('TC-35', 'dark-mode', 'ダークモード', 'prefers-color-scheme: dark で表示', { setup: 'sample' }, async () => {
    await sleep(600);
    await page.emulateMedia({ colorScheme: 'dark' });
    await sleep(600);
    await check('prefers-color-scheme: dark が効いている', () => matchMedia('(prefers-color-scheme: dark)').matches);
    const brightness = (sel, prop) =>
      page.evaluate(([s, p]) => {
        const [r, g, b] = getComputedStyle(document.querySelector(s))[p].match(/[\d.]+/g).map(Number);
        return (r + g + b) / 3;
      }, [sel, prop]);
    const bg = await brightness('body', 'backgroundColor');
    const fg = await brightness('h1', 'color');
    record('背景が暗い', bg < 80, bg);
    record('文字が明るい', fg > 170, fg);
    await page.mouse.wheel(0, 900);
    await sleep(1000);
    await page.mouse.wheel(0, -900);
  });
  await page.emulateMedia({ colorScheme: null });

  await tc('TC-36', 'mobile', 'スマホ幅（390 × 844）', '390 × 844 で表示してスクロールする', { setup: 'sample', size: { width: 390, height: 844 } }, async () => {
    await check('横スクロールが出ない', () => document.documentElement.scrollWidth <= window.innerWidth);
    await check('フォームとダッシュボードが縦に並ぶ', () => document.querySelector('.composer').getBoundingClientRect().bottom <= document.getElementById('dashboard').getBoundingClientRect().top + 1);
    for (let i = 0; i < 4; i += 1) {
      await page.mouse.wheel(0, 700);
      await sleep(700);
    }
  });

  return results;
}
