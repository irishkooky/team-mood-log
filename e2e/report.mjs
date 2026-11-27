// hero.js の実行結果（JSON）から docs/test-results.md を作り、docs/test-spec.md の「結果」列を書き換える。
//   node e2e/report.mjs <results.json> <実行情報.json>
// すべて OK なら終了コード 0、NG があれば 1。

import { readFileSync, writeFileSync, statSync } from 'node:fs';

const [resultsPath, metaPath] = process.argv.slice(2);
const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

const SPEC = 'docs/test-spec.md';
const RESULTS = 'docs/test-results.md';

const escapeCell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const videoExists = (name) => {
  try {
    return statSync(`docs/test-videos/${name}`).size > 0;
  } catch {
    return false;
  }
};

const rows = results.map((r) => {
  const hasVideo = videoExists(r.video);
  const ok = !r.error && hasVideo && r.checks.length > 0 && r.checks.every((c) => c.pass);
  const notes = [
    ...r.checks.map((c) => (c.pass ? `✓ ${c.label}` : `✗ ${c.label}（実際: ${c.actual}）`)),
    ...(r.error ? [`✗ 操作に失敗: ${r.error}`] : []),
    ...(hasVideo ? [] : ['✗ 動画を保存できませんでした']),
  ];
  return { ...r, ok, hasVideo, notes };
});

const pass = rows.filter((r) => r.ok).length;
const fail = rows.length - pass;
const summary = `${pass} / ${rows.length} OK`;

writeFileSync(
  RESULTS,
  [
    '# テスト結果 — チームの気分ログ（E2E）',
    '',
    `- 実行日時: ${meta.ranAt}（アプリ内の時刻は ${meta.now} から開始）`,
    `- 対象: ${meta.baseUrl}`,
    `- ツール: Playwright CLI ${meta.cliVersion}（公式 skill の hero script 方式で 1 ケース 1 本の動画を撮影）`,
    `- 結果: **${summary}**${fail ? `（NG ${fail} 件）` : ''}`,
    '',
    'テストケースの手順・期待結果は [test-spec.md](test-spec.md) を参照。',
    '',
    '| ID | テスト | 結果 | 確認項目 | 動画 |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(
      (r) =>
        `| ${r.id} | ${escapeCell(r.title)} | ${r.ok ? 'OK' : '**NG**'} | ${r.notes.map(escapeCell).join('<br>')} | ${
          r.hasVideo ? `[動画](test-videos/${r.video})` : '—'
        } |`,
    ),
    '',
  ].join('\n'),
);

// 仕様書の各表のいちばん右の「結果」列を書き換える
const byId = Object.fromEntries(rows.map((r) => [r.id, r.ok ? 'OK' : 'NG']));
const spec = readFileSync(SPEC, 'utf8')
  .replace(/^(\| (TC-\d+) \|.*\| )[^|]*( \|)$/gm, (line, head, id, tail) => (id in byId ? head + byId[id] + tail : line))
  .replace(/^> 最終実行: .*$/m, `> 最終実行: ${meta.ranAt} — ${summary}（結果列は npm run test:e2e のたびに更新されます）`);
writeFileSync(SPEC, spec);

for (const r of rows) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.id} ${r.title}`);
  for (const n of r.notes.filter((n) => n.startsWith('✗'))) console.log(`    ${n}`);
}
console.log(`\n結果: ${summary}${fail ? `（NG ${fail}）` : ''}`);
console.log(`動画: docs/test-videos/ / 結果: ${RESULTS} / 仕様書の結果列: ${SPEC}`);
process.exit(fail ? 1 : 0);
