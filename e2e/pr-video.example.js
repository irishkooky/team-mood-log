// PR に添付する検証動画のひな形。コピーして「シナリオ」の部分だけ書き換える。
//
//   cp e2e/pr-video.example.js e2e/output/my-feature.js   # e2e/output/ は .gitignore 済み
//   bash e2e/record-pr-video.sh e2e/output/my-feature.js   # → e2e/output/my-feature.webm
//   gh pr edit <番号> --body-file <本文> --attach e2e/output/my-feature.webm
//
// playwright-cli run-code で動くので require / process は使えない。
// __BASE_URL__ と __VIDEO_PATH__ は record-pr-video.sh が置き換える。
async page => {
  const BASE_URL = '__BASE_URL__';
  const VIDEO_PATH = '__VIDEO_PATH__';
  const results = [];

  // ---- 道具 ----
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dateKey(d); };
  const text = async (sel) => ((await page.locator(sel).first().textContent()) ?? '').replace(/\s+/g, ' ').trim();
  const check = (label, pass, actual) => results.push({ label, pass: Boolean(pass), actual });
  const submit = () => page.locator('#entry-form button[type="submit"]').click(); // 「記録する」は画面に 2 つあるので form で絞る

  /** 要素を枠で囲み、右に説明を出す（ok=false なら赤、true なら緑） */
  const callout = async (selector, message, ok, ms = 2500) => {
    const box = await page.locator(selector).first().boundingBox();
    const color = ok ? '#1f8a4c' : '#e63c3c';
    await page.screencast.showOverlay(`
      <div style="position:absolute; top:${box.y - 6}px; left:${box.x - 6}px; width:${box.width + 12}px; height:${box.height + 12}px;
        border:3px solid ${color}; border-radius:12px;"></div>
      <div style="position:absolute; top:${box.y + box.height / 2 - 18}px; left:${box.x + box.width + 24}px;
        padding:8px 14px; background:${color}; color:#fff; border-radius:10px; font-size:15px;">${message}</div>`, { duration: ms });
    await page.waitForTimeout(ms);
  };

  // ---- 準備（空の状態から） ----
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.screencast.start({ path: VIDEO_PATH, size: { width: 1280, height: 800 }, fps: 30 });
  await page.screencast.showActions({
    duration: 700,
    position: 'top-right',
    style: { point: 'width:18px; height:18px; border-radius:50%; background:rgba(230,60,60,.75)', title: 'font-size:15px' },
  });

  // ---- シナリオ（ここを書き換える） ----
  await page.screencast.showChapter('未来の日付は記録できない', { description: '例: 明日の日付で記録してみる', duration: 2000 });
  await page.locator('#f-name').pressSequentially('さくら', { delay: 80 });
  await page.locator('label', { has: page.locator('input[name="mood"][value="4"]') }).click();
  await page.locator('#f-date').fill(daysAgo(-1));
  await submit();
  await page.waitForTimeout(500);
  check('日付欄にエラーが出る', (await text('#e-date')).includes('未来'), await text('#e-date'));
  await callout('[data-field="date"]', '✗ 未来の日付はエラー', false);

  await page.screencast.showChapter('今日なら記録できる', { duration: 1500 });
  await page.locator('#f-date').fill(daysAgo(0));
  await submit();
  await page.waitForTimeout(700);
  check('トーストが出る', (await text('#toast-region')).includes('記録しました'), await text('#toast-region'));
  await callout('#toast-region', '✓ 記録できた', true);

  // ---- 後片付け ----
  await page.screencast.stop();
  return results;
}
