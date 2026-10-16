# Phase 5 本番公開・GitHub同期

2026-10-16。ローカル実装確認後のユーザー指示「本番公開及びgithub同期まで行ってください」に基づく追加作業。状態：公開準備完了、配信・本番確認中。

## 公開前

- 開始SHA `5115adbe3d4d06b333a9f9e1bd1f4b01cfce8ee4`。既存変更と承認モックを保持し、専用branch `codex/phase5-20261016` を作成した。Phase 4のbranchと未mergeのPR #3はそのまま維持する。Phase 5のPRはPhase 4 branchをbaseにして差分を分離する。
- Worker `travel-itinerary`、URL https://travel-itinerary.baribaritozan.workers.dev 。開始deployment `22da1af8-01ec-4cae-9a2a-b6101450de4a`、version `0a718c9e-ffdd-495f-ad7f-1bb29f881a3e`、100%。復旧点として保持する。
- 公開APIは19 items / 2 places、payload SHA-256 `1fec942d4a43b395a22f474ddc1b9c0b8f37646d42a2dd357f6e85d71ad7af7a`。Notion行・schema・Secrets・Worker/DO構成・60秒制限は変更しない。検証では再取得POSTを送信しない。
- 検証済みのpublic各ソースhashと完全一致。build `7cb8e398d4aa3339`、起動用16ファイル。単体109成功を再確認し、27 JS/MJS構文とWrangler 4.148.0のdeploy dry-runが成功。45ブラウザ/10 PWAの検証済み対象から製品コードを変更していない。
- 実本番の旧UIを隔離した永続Chrome profileに明示保存し、GPS0・公開安定ID・保存payload一致・公開前後payload一致を確認した。公開後に同じprofileで更新待機と明示切替を検証する。

## 再現する検証

`node scripts/phase5-production-smoke.mjs --prepare` は公開前の旧UIで検証用profileを作り明示保存する。`node scripts/phase5-production-smoke.mjs` は配信hash・旧profileの明示更新・終了後圏外起動・新UI操作・再接続・外部経路・検証profileの削除を確認する。これらは本番のGETと隔離profileだけを使用し、現在地・本番POSTを禁止し、Google Mapsと背景タイルの通信を捕捉する。

証拠はローカルartifacts配下の `phase5-production-baseline.json`、`phase5-production-smoke.json`、`phase5-production-*.png`、`phase5-publish-*.log/json`。検証用profileパスや認証情報はGitへ含めない。公開結果の要点は本書へ追記する。

## 制約

iPhone/Android実機は未確認。背景タイルの永続保存やNotionの変更は対象外。GitHub同期はPhase 5 branchと確認可能なPRまでで、mainへのmergeは行わない。
