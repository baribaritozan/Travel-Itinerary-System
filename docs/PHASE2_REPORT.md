# Phase 2 実装・検証報告

正式要求: SPECIFICATION.md v0.3。2026-10-08（JST）、FR-12〜FR-17とPhase 2受け入れ基準1〜15を実装・検証し、本番デプロイとsmokeを完了。Phase 1の全テスト・境界を維持。Git baseline・要件対応はPHASE2_PLAN.md参照。

## 変更前の検証

Node.js v24.21.0実体、npm-cli.js、子プロセスPATHのプロセス限定指定でnpm test（25/25 fail0 skip0）、npm run test:browser（13/13 fail0 skip0）、npm run build成功。OS設定変更なし。ローカル証拠はartifacts/phase2-baseline-unit.txt、phase2-baseline-browser.txt。

Git最初のpushはsandbox内DNSで失敗（Could not resolve host: github.com）。許可された実行環境で再実行し、branch/tagをls-remoteで確認。snapshot: 6f927e04a5a9ea07fba3c21fda44fbc597b64121。履歴書換え・stash・resetなし。

## Notion変更履歴（内部ID・秘密値を記録しない）

| 時刻（JST） | 変更 | 目的 / 最終状態 |
| --- | --- | --- |
| 2026-10-08 23:13頃 | Itinerary ItemsへStructure Select追加 | Item / Alternative Group / Series。既存optionを変更せず追加 |
| 2026-10-08 23:13頃 | Itinerary ItemsへParent Relation追加 | 同一DBへの一方向自己Relation。既存Relation変更なし |
| 2026-10-08 23:25頃 | [Phase2 Sample] 午前の比較 | 新規Alternative Group、Publish=false |
| 2026-10-08 23:26頃 | [Phase2 Sample] 寺と移動の系列 | 新規Series、上記グループの子、Publish=false |
| 2026-10-08 23:26頃 | [Phase2 Sample] 単独候補 | 新規Item、上記グループの子、2026-11-14 09:00–11:00 JST、Publish=false |
| 2026-10-08 23:28頃 | [Phase2 Sample] 寺の子項目 | 新規Item、上記系列の子、2026-11-14 09:00–10:00 JST、Publish=false |
| 2026-10-08 23:28頃 | [Phase2 Sample] 移動の子項目 | 新規Transit Item、上記系列の子、2026-11-14 10:00–11:00 JST、Publish=false |

変更前の公開行3件。既存行はread-only。既存プロパティの削除/rename/型変更/値clear/既存option削除なし。サンプルは上記5件のみ、新規サンプル同士だけを親子とし、既存公開Placeを読み取り参照する。新規Place/DB/Secret/Data Sourceなし。コンテナPeriodは公開子から将来日付を算出する。Notion REST schemaでParentがsingle_property（一方向）、対象が同一Data Source、StructureがSelectであることを再確認した。

## 本番・復旧

既存Worker: travel-itinerary。URL: https://travel-itinerary.baribaritozan.workers.dev 。直前version: 65cfdd10-68ee-44c1-a49a-141612930f87。wrangler deployments list成功。

2026-10-08 23:29 JSTの本番baseline smoke: 390×844/1440×900、初期表示、日付切替、単一フォーカス、詳細展開、地図2地点、横溢れなし、uncaught errorなし。API公開3件、サンプル0件、公開ID境界成功。artifacts/phase2-production-baseline.jsonと同baseline-390.png / baseline-1440.png。既存3行のproperties hashをローカル（Git対象外）に保存し、実環境検証後に完全一致を確認した。

復旧は `git worktree add -b recovery/phase2-YYYYMMDD-HHMMSS ../phase2-recovery phase2-baseline-20261008-230918` で新規checkoutを作成し、npm ci / npm run build / テストを実行後、同じwrangler.jsoncのtravel-itineraryへデプロイする。元checkoutをresetしない。Notion追加プロパティはbaseline codeが無視するため残す。サンプルはPublish=falseへ戻し、再取得・API/画面を確認する。

## 作業中のコマンド

- git status --short / branch --show-current / rev-parse HEAD / remote -v / symbolic-ref refs/remotes/origin/HEAD: 調査成功。
- git switch -c codex/phase2-20261008-230918; git add SPECIFICATION.md docs/PHASE2_GOAL_PROMPT.md; git commit; git tag -a phase2-baseline-20261008-230918; git push branch/tag: 成功。
- Node実体 --test: 階層検証追加後も既存25件成功。
- Notion connector fetch/search/query: 対象DBの一意確認、スキーマ/公開数確認。SQL DDL文書URIの探索1回はINVALID_ARGUMENT、create_databaseツールの正式DDL型定義で自己Relation/Select構文を確認。

## 要件と検証証拠

| 要件 / 基準 | 実装箇所 | 証拠 / 結果 |
| --- | --- | --- |
| FR-12 / 1 | scripts/notion.mjs buildTripPayload | phase2-sync: 全許可ルート/最大階層、循環、複数親/途中Relation、旅行不一致/複数旅行、非公開親、孤立、全禁止ネスト、Itemの子、空系列/候補不足、正規Structure、Period不包含、終日期間。成功 |
| FR-12 / 2 | publicTripPayload | SHA-256安定parentId、フラット配列、内部ID非公開、元データ不変、旧キャッシュ回帰。成功 |
| FR-14 / 3 | app.js candidateHtml/setupCandidates、styles.css | mobile1件、desktop1440で3件/1100で2件、Chrome実touchStart/Move/End、前後ボタン、左右/Home、Enter/Space。成功 |
| FR-14 / 4 | model compareCandidates/mapNodes、activateCandidate | ConfirmedがOrder低いTentative/Candidateより先、明示アクティブ、グループフォーカス/候補変更地図同期。成功 |
| FR-15 / 5 | cardHtml/details/series-timeline | 系列一候補、詳細内の子タイムライン、子フォーカス/展開/地図→子。成功 |
| FR-13 / 6 | 独立state、focusItem/paintFocus | フォーカス/詳細/選択/アクティブ/時間独立。比較操作の自動スクロールでフォーカスを置換しない。成功 |
| FR-13 / 7 | selectionState/toggleSelection | 全公開子孫（非表示Cancelled含む）によるmixed/true/false、mixed→全選択→全解除。成功 |
| FR-13 / 8 | pruneState/clear-selection | 日付/フィルター保持、再取得で削除IDだけ除外、詳細/アクティブ/時間保持、解除。成功 |
| FR-16 / 9 | filterTree/matchesFilters/comparison-status | 分類内OR/分類間AND、祖先保持、コンテナ一致時子保持、該当Item件数/非表示選択件数/解除。成功 |
| FR-16 / 10 | reservation-shortcut/show-cancelled | Required/Pending、Cancelled明示操作まで非表示、フォーカス対象除外通知。成功 |
| FR-17 / 11 | initialTimeRange/overlapsRange/shiftTimeRange | 15分・半開区間・終了なし/終日/代表時間/空/日付境界、最新の終了なし項目も初期範囲に含む、スライダー/前後/初期化、タイムライン/選択/フォーカス不変。成功 |
| FR-13〜17 / 12 | mapNodes/focusedMapIds/renderMap/paintFocus | アクティブ候補/系列子、親fallback、同地点集約、選択形状/非選択の判読可能な減光、フォーカス/経路。成功 |
| 13 | native controls、aria/live region | Tab/Enter/Space/矢印、実touch、44px測定、mixed、aria-pressed/expanded、範囲output/aria-valuetext。成功 |
| 14 | styles.css、updateCompactMap | 390×844、1440×900、200%文字、reduced-motion、Safe Area継続、document/panel横溢れ検査。画像を実際に開いて確認。成功 |
| 15 / Phase 1全要件 | 既存4テストファイルとbrowser-check前半 | 既存25テスト/13ブラウザを削除・skip・弱体化せず成功。追加27単体・統合/7ブラウザを含め成功 |

## ローカル最終コマンドと結果

Node実体: `C:\Users\wyuya\AppData\Local\Volta\tools\image\node\24.21.0\node.exe`。npm: 同ディレクトリのnode_modules/npm/bin/npm-cli.js。プロセス限定PATHでnpm子プロセスも同Nodeを使用。

| コマンド | 結果 / ローカル証拠（Git対象外） |
| --- | --- |
| npm test | 52/52、fail0、skip0。artifacts/phase2-unit-results.txt |
| npm run test:browser | build成功、20/20、fail0、skip0。artifacts/phase2-browser-results.txt |
| npm run build | 成功 |
| rg --files -g '*.js' -g '*.mjs' → 各node --check | 12/12成功 |
| git diff --check | 終了0（LF→CRLF予定通知のみ） |
| node artifacts/live-baseline.mjs（ローカル証拠スクリプト） | Notion型/Relation方向/既存行hash、本番2viewport smoke成功 |

ブラウザ検証の通常シナリオはconsole error/uncaught errorなし。失敗注入時のブラウザ自身のネットワークエラーのみ期待値として区別する。ローカルはAPI fixture、実Leaflet 1.9.4、テスト用タイルで契約を検証する。

実画像確認: artifacts/phase2-mobile-390x844.png、phase2-desktop-1440x900.png、phase2-mobile-series.png、phase2-desktop-series.png、phase2-desktop-filters.png、phase2-mobile-text-200-percent.png、phase2-mobile-text-200-filters.png、phase2-mobile-text-200-series.png。Phase 1の3画像もブラウザ回帰で再生成。200%で入れ子の左右余白を抑え、文字・操作領域を維持。

途中の失敗と修正: fixtureタイトルに内部ID文字列を使ったためID漏洩テストがタイトルへ反応→公開名称とIDを分離。候補scrimのborderが候補幅を変化→inset shadowへ。すでに開いたpopupへのclickが閉じるため、map keyboard Space操作で検証。時間範囲を移動する時にinputの旧maxが新valueをclamp→制約を先に更新。比較操作で生じるブラウザのスクロールが子フォーカスを親へ変更→操作中は自動フォーカスを抑え、ユーザーの旅程スクロールで再開。200%の入れ子カード幅→余白上限とlargeText調整。実タッチはsynthesizeScrollGestureが当該Chromeで移動しなかったためdispatchTouchEventの実ジェスチャーへ変更し、切替を検証。既存テストの期待値変更なし。各修正後に全件再実行。

## 変更ファイル / Git

scripts/notion.mjs（階層/期間/ID変換）、public/model.mjs（ツリー/選択/フィルター/時間/地図対象）、public/app.js（独立状態/候補/系列/操作）、public/styles.css（比較レイアウト/選択形状/44px/文字拡大）、tests/phase2-sync.test.mjs、tests/phase2-model.test.mjs、scripts/browser-check.mjs（既存13件をそのまま残して7件追加）、README.md、docs/DEPLOYMENT.md、PHASE2_PLAN.md、PHASE2_REPORT.md。開始時のSPECIFICATION.md/PHASE2_GOAL_PROMPT.mdはsnapshot保存後編集なし。

checkpoint: `9def321`（階層・モデル・検証計画、push済み）。検証済み実装commit: `0a82138fc58640c4106a24ab48b5edd94a2d532c`（UI/全検証/手順、push済み）。以降のcommitは本番結果の報告書のみを更新し、デプロイ済みソース・assetsは同一。

PR: [Implement Phase 2 itinerary comparison and planning #1](https://github.com/baribaritozan/Travel-Itinerary-System/pull/1)。base main、head codex/phase2-20261008-230918。open、未merge。PRを本チャットに添付済み。force-push/rebase/共有branch更新/remote tag削除なし。

## 本番デプロイと実環境結果

| 項目 | 証拠 / 結果 |
| --- | --- |
| Worker / URL | travel-itinerary / https://travel-itinerary.baribaritozan.workers.dev |
| デプロイ時刻 | 2026-10-08 23:41:33.909 JST |
| 実装commit | 0a82138fc58640c4106a24ab48b5edd94a2d532c |
| deployment ID | 7c5ad00b-005b-43a6-9f83-4f606d4b144a |
| version ID / traffic | 87cc8434-86d1-49d4-8f91-a81788237157 / 100% |
| 手順 | npm exec --yes -- wrangler deploy --dry-run → wrangler deploy。既存wrangler.jsonc使用、binding/Secret/account/environment追加なし |
| dry-run / deploy | 成功、artifacts/phase2-deploy-dry-run.txt、phase2-deploy.txt |
| deployment確認 | 既存キャッシュのwrangler/bin/wrangler.jsをNode実体で deployments status --json、成功。artifacts/phase2-deployment-status.json |
| 本番smoke期間 | 2026-10-08 23:43:37〜23:44:56 JST、node artifacts/live-phase2.mjs 0a82138fc58640c4106a24ab48b5edd94a2d532c |
| 本番条件 | 390×844のタッチ相当、1440×900 PC、390×844でLeaflet script遮断。3/3成功 |
| 確認項目 | 初期表示、旅行日付、Phase 1単一フォーカス/独立詳細、候補順/前後/矢印/Homeと地図、系列内フォーカス/詳細、親子選択/地図強調、分類/予約/Cancelled/解除、時間範囲/前後/初期化、日付後の選択保持、手動再取得 |
| 実Notion→API | 5サンプルが公開されAPI全8件、structure/公開parentId/フラット配列、親Periodを子から算出。内部ID非公開 |
| 通常時エラー | console error 0、uncaught 0、横溢れなし。Leaflet遮断時は期待されたブラウザnetwork errorのみ、全旅程操作と外部地図リンク継続 |
| 後片付け | 全5行Publish=falseを再読取、公開API全3件/サンプル0件、公開画面サンプル0件。削除/archiveなし |
| 既存データ | 開始時の公開3行のproperties hash全件一致。既存行の値を変更していない |
| ローカル証拠 | artifacts/phase2-production-results.json、phase2-production-command.txt、phase2-production-0.png / -1.png / -2.png、phase2-production-cleanup.png。画像を実際に確認 |

既存クールダウンを守るため、Notion非公開化後、最初の成功再取得から62秒以上になるまで待ってから1回だけ再取得した。実公開は各行約15〜18秒。キャッシュ内のサンプルも23:44:56 JSTまでに除去を確認した。

### 新規サンプルの一時公開・非公開記録（全て2026-10-08 JST）

| 名称 | Publish=true | Publish=false | 最終状態 |
| --- | --- | --- | --- |
| [Phase2 Sample] 移動の子項目 | 23:43:40.941 | 23:43:58.476 | false、削除/archiveなし |
| [Phase2 Sample] 寺の子項目 | 23:43:41.466 | 23:43:57.166 | false、削除/archiveなし |
| [Phase2 Sample] 単独候補 | 23:43:41.995 | 23:43:56.647 | false、削除/archiveなし |
| [Phase2 Sample] 寺と移動の系列 | 23:43:42.549 | 23:43:56.117 | false、削除/archiveなし |
| [Phase2 Sample] 午前の比較 | 23:43:43.489 | 23:43:55.528 | false、削除/archiveなし |

API検証・ブラウザ検証はtry/finallyで実行し、エラー時もこのallowlistの新規サンプルだけを非公開へ戻す。秘密値/内部ID/ローカル証拠はGitへ追加しない。Notion追加Structure/Parentは残し、baseline codeが無視できる。重大な回帰なし、rollback不要。

補足コマンド: sandbox内のnpm exec wrangler deployments status --helpはregistry.npmjs.orgのENOTFOUNDで失敗。OS設定を変えず、既に存在するnpmキャッシュのWrangler 4.148.0をNode実体で直接起動し、正式helpで--jsonを確認、許可された実行環境でstatus取得に成功。GitHub connectorでPR作成成功。

既知の制約: 実機iOS/Safariは追加互換検証の範囲。外部CDN/タイルの将来稼働は保証せず、失敗時の継続利用を検証した。Phase 3、採用候補のNotion保存、Web編集は対象外。Phase 2必須要件・検証・実環境操作の未達なし。
