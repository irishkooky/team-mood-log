---
name: create-pr
description: このリポジトリで PR を作る・PR の説明を書き直すときに使う。.github/pull_request_template.md の見出し（概要・動機・背景・動き・変更点・確認）をすべて埋めた本文で gh pr create / gh pr edit する。「PR出して」「プルリク作って」「PRの説明を直して」などで必ず使う。
---

# PR をテンプレートどおりに作る

PR の本文は必ず `.github/pull_request_template.md` の形式で書く。見出しを省いたり、順番を変えたり、独自の見出しを足したりしない。

## 1. テンプレートを読む

毎回 `.github/pull_request_template.md` をその場で読む（見出しは変わることがあるので、記憶に頼らない）。`## ` で始まる行が埋めるべき見出し、`<!-- -->` の中が各見出しの書き方のヒント。

## 2. 材料を集める

```sh
git status --short
git log --oneline main..HEAD
git diff main...HEAD --stat
git diff main...HEAD
```

- main ブランチにいるときは、先に作業内容に合ったブランチを切る（`feature/…`、`fix/…`、`chore/…`）
- 未コミットの変更があれば、PR に含めるべきかを確認してからコミットする
- 「動機」「背景」は会話の流れ・Issue・コミットメッセージから書く。**根拠が見つからないときは作らずにユーザーに聞く**

## 3. 見出しごとに埋める

| 見出し | 書くこと |
|---|---|
| 概要 | この PR で何をするかを 1〜3 行で |
| 動機 | なぜこの変更をするのか（解決したい課題、使う人にとって何が良くなるか） |
| 背景 | 前提となる経緯、制約、関連する Issue / PR（`#番号`） |
| 動き | 変更後のふるまい、仕様、細かいルールの箇条書き |
| 変更点 | ファイル／モジュールごとに何を変えたか |
| 確認 | 実際にやった確認だけ `[x]`。やっていないものは `[ ]` のまま残す |

ルール:
- テンプレートの `<!-- -->` コメントと、中身のない `- ` だけの行は消す
- 「確認」でやっていないことに `[x]` を付けない。`node --test` を走らせたなら件数も書く
- 本文の最後に、会話で指定された PR 用の署名行を付ける

## 4. 本文を検証してから出す

本文はスクラッチパッドのファイルに書き、出す前に次で検証する。何か出力されたら直してからやり直す。

```sh
BODY=<本文ファイルのパス>
grep '^## ' .github/pull_request_template.md | while IFS= read -r h; do
  grep -qxF "$h" "$BODY" || echo "見出しがない: $h"
done
diff <(grep '^## ' .github/pull_request_template.md) <(grep '^## ' "$BODY") >/dev/null || echo "見出しの順番・種類がテンプレートと違う"
grep -n '<!--' "$BODY" && echo "コメントが残っている"
grep -nE '^- *$' "$BODY" && echo "空の箇条書きが残っている"
```

## 5. PR を作る／更新する

```sh
git push -u origin <ブランチ名>
gh pr create --base main --head <ブランチ名> --title "<タイトル>" --body-file "$BODY"
# 既存の PR を直すとき
gh pr edit <番号> --body-file "$BODY"
```

出したあと `gh pr view <番号> --json body -q .body | grep '^## '` で、見出しがテンプレートどおりに反映されたことを確かめる。最後に PR の URL と、確認で `[ ]` のまま残した項目をユーザーに伝える。
