# Phase 5 本番公開・GitHub同期

2026-10-16。ローカル実装確認後のユーザー指示「本番公開及びgithub同期まで行ってください」に基づく追加作業。状態：本番公開・実本番Chrome確認・GitHub同期完了。機械可読の結果は [PHASE5_PUBLISH_EVIDENCE.json](PHASE5_PUBLISH_EVIDENCE.json)。

## 公開前

- 開始SHA `5115adbe3d4d06b333a9f9e1bd1f4b01cfce8ee4`。既存変更と承認モックを保持し、専用branch `codex/phase5-20261016` を作成した。Phase 4のbranchと未mergeのPR #3はそのまま維持する。Phase 5のPRはPhase 4 branchをbaseにして差分を分離する。
- Worker `travel-itinerary`、URL https://travel-itinerary.baribaritozan.workers.dev 。開始deployment `22da1af8-01ec-4cae-9a2a-b6101450de4a`、version `0a718c9e-ffdd-495f-ad7f-1bb29f881a3e`、100%。復旧点として保持する。
- 公開APIは19 items / 2 places、payload SHA-256 `1fec942d4a43b395a22f474ddc1b9c0b8f37646d42a2dd357f6e85d71ad7af7a`。Notion行・schema・Secrets・Worker/DO構成・60秒制限は変更しない。検証では再取得POSTを送信しない。
- 検証済みのpublic各ソースhashと完全一致。build `7cb8e398d4aa3339`、起動用16ファイル。単体109成功を再確認し、27 JS/MJS構文とWrangler 4.148.0のdeploy dry-runが成功。45ブラウザ/10 PWAの検証済み対象から製品コードを変更していない。
- 実本番の旧UIを隔離した永続Chrome profileに明示保存し、GPS0・公開安定ID・保存payload一致・公開前後payload一致を確認した。公開後に同じprofileで更新待機と明示切替を検証する。

## 再現する検証

`node scripts/phase5-production-smoke.mjs --prepare` は公開前の旧UIで検証用profileを作り明示保存する。`node scripts/phase5-production-smoke.mjs` は配信hash・旧profileの明示更新・終了後圏外起動・新UI操作・再接続・外部経路・検証profileの削除を確認する。これらは本番のGETと隔離profileだけを使用し、現在地・本番POSTを禁止し、Google Mapsと背景タイルの通信を捕捉する。

証拠はローカルartifacts配下の `phase5-production-baseline.json`、`phase5-production-smoke.json`、`phase5-production-*.png`、`phase5-publish-*.log/json`。検証用profileパスや認証情報はGitへ含めない。公開結果の要点は本書へ追記する。

## 公開結果

- 実装commit `1ec11c890090ea239b48373e2bb7404ced673db1`、build `7cb8e398d4aa3339`を配信した。version `8cb51eb0-0744-4951-af39-39da537912d1`、deployment `27f967b2-8c42-48c2-973b-c7e8ef80e14b`、100%。配信日時は2026-10-16 16:46 JST（API記録 `2026-10-16T07:46:17.391527Z`）。既存Worker/DO/bindings/vars/Secretsを維持した。
- 専用branch `codex/phase5-20261016` と復旧用annotated tag `phase5-baseline-20261016` をoriginへpushした。[PR #4](https://github.com/baribaritozan/Travel-Itinerary-System/pull/4)を作成し、このチャットへ添付した。baseは未mergeのPhase 4 branch、headはPhase 5。mainとPR #3は変更していない。
- 公開後のsmokeは成功。16起動ファイルのSHA-256、SW本文/JavaScript MIME/no-cacheがローカルbuildと一致。実本番の保存済み旧UIが更新待機中に自動reloadせず、明示切替1回で新UIへ移行し、保存旅程・保存日時・期限が変わらず、新版cacheのみになることを確認した。
- 同じprofileを終了して圏外で再起動し、新UIの候補・全画面復帰・詳細・比較保持・その他/絞り込み/時間・地図の操作、pin・概略線を確認した。UI状態は新たに永続化していない。再接続はGETのみ。登録済みFrom→Toは実popupでopener=null、Google通信捕捉を確認した。
- 最後に検証用profileの明示削除を操作し、DB/cache/SWが各0を確認。実ユーザーのブラウザprofileは操作していない。現在地取得0、本番POST0、公開APIのhashは前後完全一致（19項目/2地点）。公開中の既存サンプル行も変更していない。
- 新規profileでも新UIが直接表示され、初期地図minimal、明示保存前のDB/cache/SW各0・現在地取得0・POST0を確認した。`phase5-production-fresh.json` / `phase5-production-fresh.log`。
- 本番mobile/desktop/offline/fullscreenと新規profileの5画像を生成して実際に開いた。画面構成、メニューバー、候補表示、圏外通知を確認した。背景地図は捕捉したfixture tileで、OSMへの自動走査や保存をしない。
- 公開記録を追記する後続commitは文書と証拠のみ。実装commitとの差分に製品コードは含まれないため、配信済みversionとの対応を保持する。

## 更新と復旧

通常は保存済み旧UIの「端末保存とホーム画面 → 更新があります・切り替える」を操作する。新UIでは「その他 → 端末保存とホーム画面」。他のタブが開いている場合は閉じてから再試行する。新規アクセスは新UIを直接表示する。

変更前のPhase 4 version `0a718c9e-ffdd-495f-ad7f-1bb29f881a3e` とtag `phase5-baseline-20261016` を復旧点にする。通常のversion切替だけで既存端末のSWを退役できると扱わず、必要時は従来の検証済みnetwork-only復旧SWと再接続時の確認を使用する。今回は復旧操作を必要とせず、正常に公開・検証を完了した。

## 制約

iPhone/Android実機は未確認。背景タイルの永続保存やNotionの変更は対象外。GitHub同期はPhase 5 branchと確認可能なPRまでで、mainへのmergeは行わない。
