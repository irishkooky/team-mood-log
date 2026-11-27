#!/usr/bin/env bash
# docs/test-spec.md のテストケースを Playwright CLI で実行し、1 ケース 1 本の動画を docs/test-videos/ に撮る。
# 撮影は Playwright CLI 公式 skill（.claude/skills/playwright-cli）の video-recording の
# 「Record entire hero scripts」に従い、e2e/hero.js を playwright-cli run-code --filename で実行する。
#
#   npm start            # 別ターミナルでアプリを起動しておく
#   npm run test:e2e     # または: bash e2e/run-e2e.sh
#
# 環境変数: BASE_URL（既定 http://localhost:3000）

set -u
cd "$(dirname "$0")/.."
ROOT=$PWD

BASE_URL=${BASE_URL:-http://localhost:3000}
VIDEOS=docs/test-videos
OUTPUT=e2e/output
# 2026-11-20（金）12:00 JST から時計を進める。今週は 11/16（月）〜 11/22（日）
NOW='2026-11-20T12:00:00+09:00'
CLI="$ROOT/node_modules/.bin/playwright-cli"
SESSION=mood-e2e

if [ ! -x "$CLI" ]; then
  echo "playwright-cli が見つかりません。npm install を実行してください" >&2
  exit 2
fi
if ! curl -fsS -o /dev/null "$BASE_URL"; then
  echo "$BASE_URL に接続できません。先に npm start でアプリを起動してください" >&2
  exit 2
fi

pw() { "$CLI" -s="$SESSION" "$@"; }

mkdir -p "$VIDEOS" "$OUTPUT"
rm -f "$VIDEOS"/TC-*.webm "$OUTPUT"/*.json "$OUTPUT"/*.log "$OUTPUT"/hero.run.js

# 仕様書の節ごとに分けて実行する（run-code 1 回の時間に上限があるため）。「〜の続き」のケースは同じ組に入れる
CASE_GROUPS=(
  'TC-01 TC-02 TC-03'
  'TC-04 TC-05 TC-06 TC-07 TC-08 TC-09 TC-10 TC-11 TC-12'
  'TC-13 TC-14 TC-15 TC-16 TC-17'
  'TC-18 TC-19 TC-20 TC-21 TC-22 TC-23'
  'TC-24 TC-25 TC-26 TC-27 TC-28'
  'TC-29 TC-30 TC-31 TC-32 TC-33 TC-34'
  'TC-35 TC-36'
)

# hero.js の __CONFIG__ を実際の設定に置き換える（run-code では process や require が使えないため）
make_run_file() {
  node -e '
    const fs = require("fs");
    const [src, out, baseUrl, now, root, videos, output, only, first] = process.argv.slice(1);
    const config = {
      baseUrl, now,
      size: { width: 1280, height: 800 },
      videoDir: `${root}/${videos}`,
      outputDir: `${root}/${output}`,
      fixturesDir: `${root}/e2e/fixtures`,
      only: only.split(" "),
      first: first === "1",
    };
    fs.writeFileSync(out, fs.readFileSync(src, "utf8").replace("const CONFIG = __CONFIG__;", `const CONFIG = ${JSON.stringify(config)};`));
  ' e2e/hero.js "$OUTPUT/hero.run.js" "$BASE_URL" "$NOW" "$ROOT" "$VIDEOS" "$OUTPUT" "$1" "$2"
}

echo "Playwright CLI でブラウザを起動し、36 ケースを録画しながら実行します（$BASE_URL）"
pw close >/dev/null 2>&1
pw open >/dev/null || { echo "ブラウザを起動できませんでした" >&2; exit 2; }

RAN_AT=$(date '+%Y-%m-%d %H:%M')
first=1
i=0
for group in "${CASE_GROUPS[@]}"; do
  i=$((i + 1))
  echo "  [$i/${#CASE_GROUPS[@]}] $group"
  make_run_file "$group" "$first"
  first=0
  pw --raw run-code --filename="$OUTPUT/hero.run.js" > "$OUTPUT/results-$i.json" 2> "$OUTPUT/run-code-$i.log"
  if ! node -e 'if (!Array.isArray(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")))) process.exit(1)' "$OUTPUT/results-$i.json" 2>/dev/null; then
    echo "テストの実行に失敗しました（$group）。出力:" >&2
    head -40 "$OUTPUT/results-$i.json" "$OUTPUT/run-code-$i.log" >&2
    pw close >/dev/null 2>&1
    exit 2
  fi
done
pw close >/dev/null 2>&1

node -e '
  const fs = require("fs");
  const [out, ...files] = process.argv.slice(1);
  fs.writeFileSync(out, JSON.stringify(files.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")))));
' "$OUTPUT/results.json" $(for n in $(seq 1 $i); do echo "$OUTPUT/results-$n.json"; done)

node -e '
  const [out, ranAt, now, baseUrl, cliVersion] = process.argv.slice(1);
  require("fs").writeFileSync(out, JSON.stringify({ ranAt, now, baseUrl, cliVersion }));
' "$OUTPUT/meta.json" "$RAN_AT" "$NOW" "$BASE_URL" "$("$CLI" --version 2>/dev/null)"

node e2e/report.mjs "$OUTPUT/results.json" "$OUTPUT/meta.json"
