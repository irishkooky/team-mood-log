# テスト結果 — チームの気分ログ（E2E）

- 実行日時: 2026-11-20 16:53（アプリ内の時刻は 2026-11-20T12:00:00+09:00 から開始）
- 対象: http://localhost:3000
- ツール: Playwright CLI 0.1.25（公式 skill の hero script 方式で 1 ケース 1 本の動画を撮影）
- 結果: **36 / 36 OK**

テストケースの手順・期待結果は [test-spec.md](test-spec.md) を参照。

| ID | テスト | 結果 | 確認項目 | 動画 |
| --- | --- | --- | --- | --- |
| TC-01 | 初回表示（記録なし） | OK | ✓ ヘッダーに今日の日付<br>✓ 「まだ記録がありません」の案内<br>✓ 「サンプルデータで試す」ボタンがある<br>✓ 日付欄に今日の日付 | [動画](test-videos/TC-01_initial-empty.webm) |
| TC-02 | サンプルデータを読み込む | OK | ✓ トーストが出る<br>✓ 今週が表示される<br>✓ 集計カードが 4 枚出る<br>✓ マス目にメンバーの行がある<br>✓ メンバーのチップが出る | [動画](test-videos/TC-02_sample-data.webm) |
| TC-03 | 「今日の気分を記録する」で名前欄へ | OK | ✓ 名前欄にフォーカス | [動画](test-videos/TC-03_focus-form.webm) |
| TC-04 | 気分の選択 | OK | ✓ 「最高」が選択されている<br>✓ フォーム上部の顔が「最高」になる | [動画](test-videos/TC-04_mood-selected.webm) |
| TC-05 | 気分の選択解除（もう一度押す） | OK | ✓ 選択が外れる<br>✓ 顔が「?」に戻る | [動画](test-videos/TC-05_mood-unselected.webm) |
| TC-06 | ひとことの文字数カウンター | OK | ✓ カウンターが 10 / 80 | [動画](test-videos/TC-06_note-counter.webm) |
| TC-07 | 記録の登録 | OK | ✓ トーストが出る<br>✓ マス目の金曜に「あおい」の記録<br>✓ ひとこと一覧に 1 件<br>✓ ひとことが出る<br>✓ フォームがリセットされ名前だけ残る | [動画](test-videos/TC-07_entry-added.webm) |
| TC-08 | 同じ人・同じ日の上書き | OK | ✓ 上書きのトースト<br>✓ 記録は 1 件のまま<br>✓ 気分が「最高」になる | [動画](test-videos/TC-08_entry-overwritten.webm) |
| TC-09 | 名前なしの記録 | OK | ✓ 追加のトースト<br>✓ 一覧に「名前なし」で出る | [動画](test-videos/TC-09_anonymous-entry.webm) |
| TC-10 | ⌘/Ctrl + Enter で記録 | OK | ✓ トーストが出る<br>✓ 記録が 1 件 | [動画](test-videos/TC-10_ctrl-enter.webm) |
| TC-11 | 過去の日付で記録 | OK | ✓ 火曜（11/17）のマスに記録<br>✓ 一覧の日付が 11/17（火） | [動画](test-videos/TC-11_past-date.webm) |
| TC-12 | メンバーのチップで名前を入れる | OK | ✓ 名前欄に「ゆい」<br>✓ 気分の選択肢にフォーカス | [動画](test-videos/TC-12_member-chip.webm) |
| TC-13 | すべて空で送信 | OK | ✓ エラーまとめが出る<br>✓ 気分欄のエラー<br>✓ 記録は増えない | [動画](test-videos/TC-13_error-empty.webm) |
| TC-14 | ひとことの文字数オーバー | OK | ✓ 81 / 80 が警告表示<br>✓ ひとことのエラー<br>✓ ひとこと欄が aria-invalid | [動画](test-videos/TC-14_error-note-too-long.webm) |
| TC-15 | 名前の文字数オーバー | OK | ✓ 名前のエラー<br>✓ 記録は増えない | [動画](test-videos/TC-15_error-name-too-long.webm) |
| TC-16 | 未来の日付 | OK | ✓ 日付のエラー<br>✓ 記録は増えない | [動画](test-videos/TC-16_error-future-date.webm) |
| TC-17 | エラーまとめのリンクとエラーの解消 | OK | ✓ リンクで日付欄にフォーカス<br>✓ 日付のエラー表示が消える<br>✓ エラーまとめが閉じる | [動画](test-videos/TC-17_error-cleared.webm) |
| TC-18 | マスにカーソルでツールチップ | OK | ✓ ツールチップが出る<br>✓ ツールチップに名前・日付・ひとこと | [動画](test-videos/TC-18_tooltip.webm) |
| TC-19 | 前の週へ | OK | ✓ 見出しが「先週」<br>✓ 期間が 11月9日 – 15日<br>✓ 「今週へ」が出て「次の週」が使える | [動画](test-videos/TC-19_prev-week.webm) |
| TC-20 | 今週へ戻る | OK | ✓ 今週に戻る<br>✓ 「次の週」は無効 | [動画](test-videos/TC-20_back-to-this-week.webm) |
| TC-21 | ← → キーで週を移動 | OK | ✓ ← 2 回で 2週間前<br>✓ → 1 回で先週<br>✓ 今週より先には進まない | [動画](test-videos/TC-21_arrow-keys.webm) |
| TC-22 | 推移の棒でその週へ | OK | ✓ 10月26日の週が表示される<br>✓ その棒が選択状態 | [動画](test-videos/TC-22_trend-click.webm) |
| TC-23 | 記録のない週 | OK | ✓ 9月28日の週が表示される<br>✓ 空の週の案内<br>✓ 「この週の日付で記録する」ボタン | [動画](test-videos/TC-23_empty-week.webm) |
| TC-24 | 記録の削除 | OK | ✓ 記録が 1 件減る（15 → 14）<br>✓ 削除のトースト<br>✓ 「元に戻す」がある | [動画](test-videos/TC-24_delete.webm) |
| TC-25 | 削除の取り消し | OK | ✓ 件数が元に戻る（15 件）<br>✓ 削除した記録が戻る | [動画](test-videos/TC-25_delete-undo.webm) |
| TC-26 | すべて消去（1 回目は確認） | OK | ✓ ボタンが確認表示になる<br>✓ まだ記録は消えない | [動画](test-videos/TC-26_clear-armed.webm) |
| TC-27 | すべて消去（実行） | OK | ✓ 「まだ記録がありません」に戻る<br>✓ 消去のトースト（103件）<br>✓ 保存データも空 | [動画](test-videos/TC-27_clear-done.webm) |
| TC-28 | すべて消去の取り消し | OK | ✓ 消去前の 103 件に戻る<br>✓ ダッシュボードが戻る | [動画](test-videos/TC-28_clear-undo.webm) |
| TC-29 | 再読み込み後も記録が残る | OK | ✓ 記録が残っている<br>✓ ひとことも残っている<br>✓ 名前欄に最近のメンバーが入る | [動画](test-videos/TC-29_persist-reload.webm) |
| TC-30 | 壊れた保存データ | OK | ✓ バナーが出る<br>✓ 読める 1 件だけ表示 | [動画](test-videos/TC-30_broken-storage.webm) |
| TC-31 | JSON で書き出す | OK | ✓ ファイル名が team-mood-log-2026-11-20.json<br>✓ 中身が {version:1, entries} で 103 件（保存データと一致） | [動画](test-videos/TC-31_export.webm) |
| TC-32 | JSON を読み込む | OK | ✓ トースト「1件を追加、1件を更新しました」<br>✓ 件数が 103 → 104<br>✓ 「みなと」が増える<br>✓ さくらの今日のひとことが更新される | [動画](test-videos/TC-32_import.webm) |
| TC-33 | 読み込みの取り消し | OK | ✓ 件数が 103 件に戻る<br>✓ 「みなと」が消える | [動画](test-videos/TC-33_import-undo.webm) |
| TC-34 | 読めないファイルを読み込む | OK | ✓ エラーのトースト<br>✓ 記録は変わらない | [動画](test-videos/TC-34_import-invalid.webm) |
| TC-35 | ダークモード | OK | ✓ prefers-color-scheme: dark が効いている<br>✓ 背景が暗い<br>✓ 文字が明るい | [動画](test-videos/TC-35_dark-mode.webm) |
| TC-36 | スマホ幅（390 × 844） | OK | ✓ 横スクロールが出ない<br>✓ フォームとダッシュボードが縦に並ぶ | [動画](test-videos/TC-36_mobile.webm) |
