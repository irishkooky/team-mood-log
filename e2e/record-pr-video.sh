#!/usr/bin/env bash
# PR 添付用の動画を 1 本撮る。シナリオは e2e/pr-video.example.js をコピーして書く。
#
#   npm start                                          # 別ターミナルでアプリを起動（PORT=3001 npm start なども可）
#   bash e2e/record-pr-video.sh e2e/output/my-feature.js [出力.webm]
#
# 出力の既定はシナリオと同じ名前の .webm（*.webm は .gitignore 済み）。
# 標準出力に各チェックの結果（JSON）を出し、失敗があれば終了コード 1。
# 環境変数: BASE_URL（既定 http://localhost:${PORT:-3000}）

set -u
cd "$(dirname "$0")/.."
ROOT=$PWD

SCRIPT=${1:?使い方: bash e2e/record-pr-video.sh <シナリオ.js> [出力.webm]}
OUT=${2:-${SCRIPT%.js}.webm}
BASE_URL=${BASE_URL:-http://localhost:${PORT:-3000}}
CLI="$ROOT/node_modules/.bin/playwright-cli"
SESSION=pr-video

[ -x "$CLI" ] || { echo "playwright-cli が見つかりません。npm install を実行してください" >&2; exit 2; }
curl -fsS -o /dev/null "$BASE_URL" || { echo "$BASE_URL に接続できません。先に npm start してください" >&2; exit 2; }

case "$OUT" in /*) ;; *) OUT="$ROOT/$OUT" ;; esac
mkdir -p "$(dirname "$OUT")" "$ROOT/e2e/output"
RUN="$ROOT/e2e/output/.pr-video.run.js"
node -e '
  const fs = require("fs");
  const [src, out, baseUrl, video] = process.argv.slice(1);
  fs.writeFileSync(out, fs.readFileSync(src, "utf8").replaceAll("__BASE_URL__", baseUrl).replaceAll("__VIDEO_PATH__", video));
' "$SCRIPT" "$RUN" "$BASE_URL" "$OUT"

"$CLI" -s="$SESSION" close >/dev/null 2>&1
"$CLI" -s="$SESSION" open >/dev/null || { echo "ブラウザを起動できませんでした" >&2; exit 2; }
RESULT=$("$CLI" -s="$SESSION" --raw run-code --filename="$RUN")
STATUS=$?
"$CLI" -s="$SESSION" close >/dev/null 2>&1

echo "$RESULT"
[ $STATUS -eq 0 ] || exit 2
[ -f "$OUT" ] && echo "動画: $OUT ($(du -h "$OUT" | cut -f1))" >&2
echo "$RESULT" | node -e 'const r = JSON.parse(require("fs").readFileSync(0, "utf8")); process.exit(Array.isArray(r) && r.some((x) => x.pass === false) ? 1 : 0)'
