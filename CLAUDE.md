# team-mood-log

ビルド不要の HTML / CSS / JS アプリ。構成と仕様は README.md。ロジックは `src/core.js`（DOM 非依存）、画面は `src/app.js`。

## コマンド

- テスト: `node --test`（ロジックを変えたら `test/core.test.js` に足す）
- 起動: `npm start`（3000 番。塞がっていたら別ポートに逃げずに失敗する。`PORT=3001 npm start` で変更可）
- ブラウザで確認するときは preview_start `{name: "team-mood-log"}`
- 全ケースの E2E 録画: `npm run test:e2e`（重い。頼まれたときだけ）

## PR と検証動画

- PR は `create-pr` スキルの手順で作る（本文はテンプレートの見出しどおり）
- 検証動画は `e2e/pr-video.example.js` を `e2e/output/` にコピーしてシナリオだけ書き換え、`bash e2e/record-pr-video.sh e2e/output/<名前>.js` で撮る
- 添付は `gh pr edit <番号> --body-file <本文> --attach <動画>`（本文に `![x](./動画.webm)` と書けばその位置に入る）。gh 2.99 以上が必要
- 動画（`*.webm` / `*.mp4` / `*.mov`、`docs/test-videos/`）は .gitignore 済み。コミットしない

## つまずきどころ

- 「記録する」ボタンは画面に 2 つある。`#entry-form button[type="submit"]` で指定する
- RTK のフックは `--help` の出力を消すことがある。ヘルプは `rtk proxy <コマンド> --help` で読む
- 日付入力は `#f-date`、エラー表示は `#e-<項目名>`、トーストは `#toast-region`
