# Phase 3 実装・検証報告

正式要求はSPECIFICATION.md v0.4。実施日2026-10-12、Asia/Tokyo。現在はローカル検証・Notion追加が完了、本番デプロイ/smoke/後片付け/PRの結果を追記するまで未完了。

## 実装と要件・証拠の対応

| Phase 3基準 / FR | 実装 | 自動検証・再現可能な証拠 |
| --- | --- | --- |
| 1 / FR-18 | scripts/notion.mjs buildTripPayload/publicTripPayload、public/model.mjs buildTree | phase3-syncの全許可階層、安定副次ID、旧payload。browser「Flexible Block checklist」。実Notionサンプル「自由時間/寺の候補/駅の候補」 |
| 2 | 同期時のancestryと文脈別Period検証、validateContainer | 通常Item必須、自由時間start/end必須、自由時間直下/寄り道内例外とDuration。既存Phase 2期間算出/包含テストも成功 |
| 3 | 同期主階層allowed、循環/親/旅行/公開/子数検証 | 新規の全許可親と最大Alternative Group→Series→Flexible Block→Item、禁止辺/空自由時間。既存の循環/複数親/異旅行/非公開/孤立/禁止ネスト/空系列/候補不足を無変更で成功 |
| 4 | app.js cardHtmlのflexible-candidates、compareUntimed | browser候補順/時刻未定/ノード0/目安時間/費用/営業時間、phase3-free/candidate画像。親の時刻をstartへ転記しない |
| 5 | filterTree/mapNodes/focusedMapIds/selectionState/toggleSelection | model親子focus/三状態/祖先保持/親時間範囲、browser親子focus/選択/フィルター/時間範囲/独立状態 |
| 6 / FR-19 | 同期Detour For型/件数/対象/ancestry検証 | phase3-syncのwrong type/multiple/truncated/self/non Transit/private/different Trip/missing/container/descendant/child、寄り道内自由時間禁止、追加時間/Rejoin型・件数・公開検証 |
| 7 | 主階層childrenと副次detours分離、Transit詳細内detour-routes | browser「detours」のItem/Series/Alternative Group、系列子focus、候補前後。実Notion単独/系列/比較サンプル |
| 8 | detourAssessment（完全な公開treeと同じ候補枝を使用）、paintFocus再計算 | model余裕/0/超過/判定不可/同じ系列。browser「next fixed candidate changes assessment」でアクティブ次候補変更とフィルター不変。登録値の目安表示 |
| 9 | buildTree roots除外、mapNodes明示条件 | model対象Transit展開だけでは非表示、寄り道自身の展開/focus/選択で表示。browserトップレベル3件、詳細内3構造、展開時だけ地点表示 |
| 10 / FR-20 | requestLocationのみgetCurrentPosition、busy時重複禁止 | browser初期/カード/日付等要求0、明示操作後1、watchPositionを呼ぶと失敗するfixture |
| 11 | 現在地専用layer、status、expiry timer | browser成功/精度/時刻/専用marker/circle、denied/timeout/unavailable/insecure/unsupported、5分超で古い表示・更新案内 |
| 12 | currentLocationメモリ変数、payload/state/storage/logと独立 | browser Storage/IndexedDB/Cache/Service Worker空、request/consoleへテスト座標なし、reloadでmarker/位置要求0。appの保存/サーバー送信経路なし |
| 13 / FR-21 | resolveDestination/buildDirectionsUrl、明示buttonからwindow.open | model全構造、全travelmode、公開住所encoding、固定origin/許可パラメーター。browser「Directions all structures」通常/Transit/自由時間子/寄り道/Series/active group、無効理由、実popup opener=null。現在地は操作時にのみURLへ追加、第三者送信文言あり |
| 14 | 失敗状態を旅程stateと独立、外部経路catch | browser位置取得全失敗でも選択可、「map/external failure」でLeaflet遮断/外部popup例外でも候補詳細・選択・既存地図リンク継続 |
| 15 | 既存CSS色/余白/リング/native controls/ariaを拡張 | 390×844、1440×900、200%文字、reduced motion、44px測定、Tab/Enter/Space/矢印、横溢れなし。実際に画像を開いて確認 |
| 16 / FR-01〜17 | 既存6テストファイルと既存browser20件を保持 | 既存52 + 追加41 = 93/93、既存20 + 追加13 = 33/33、fail0 skip0。既存testsファイルのbaselineとの差分0、既存browser期待値/テスト本体変更なし（open helperに任意initScriptを追加） |

Phase 1・2の既存テストはtimezone/公開境界/危険URL/キャッシュ/refresh/webhook/日付/詳細/単一focus/地図/候補/系列/複数選択/フィルター/時間範囲/モバイル/キーボードを継続検証する。対象外のWeb編集、採用案保存、経路検索API、継続追跡、PWAは追加していない。

## ローカル検証コマンド

Node実体 `C:\Users\wyuya\AppData\Local\Volta\tools\image\node\24.21.0\node.exe`、同ディレクトリの `node_modules/npm/bin/npm-cli.js`、子プロセス限定PATHを使用。OS設定変更なし。以下のnpmはこの実体経由。ブラウザはインストール済みChrome、ローカルfixture、実Leaflet 1.9.4、テストタイル。Google Maps通信はroute.fulfillまたはwindow.open捕捉で外部へ送らない。実際の現在地は取得していない。

| コマンド / 段階 | 結果 / artifacts内ローカル証拠（Git対象外） |
| --- | --- |
| git status --short / branch --show-current / log -1 / remote -v / symbolic-ref refs/remotes/origin/HEAD / diff --stat / diff -- SPECIFICATION.md / log -- SPECIFICATION.md | 開始時main/clean、ユーザー変更なし、仕様commit特定 |
| 変更前 npm test / npm run build / 全node --check | 52/52、build成功、12構文成功。phase3-baseline-unit.txt |
| 変更前 npm run test:browser | sandbox localhost ERR_NETWORK_ACCESS_DENIED、制限外再実行20/20。phase3-baseline-browser.txt / phase3-baseline-browser-unrestricted.txt |
| node --test tests/phase3-sync.test.mjs（実装前） | 6/33、27失敗を確認。phase3-sync-red.txt |
| 同期実装後 node --test | 85/85。phase3-sync-green.txt |
| node --test tests/phase3-model.test.mjs（実装前） | 0/8、失敗確認。phase3-model-red.txt |
| モデル実装後 node --test | 最初mapNodesのflatMap index引数を時間文脈と誤解→明示callbackに修正、93/93。phase3-model-green.txt |
| node scripts/build.mjs; node --test --test-name-pattern='Phase 3' scripts/browser-check.mjs（UI前） | 新規10/10失敗を確認。phase3-browser-red.txt |
| npm run test:browser（UI追加後） | 29/30。5分超の表示timer境界を修正。phase3-browser-first.txt |
| npm run test:browser（期限timer修正後） | 29/30、既存scroll focusの一時失敗。phase3-browser-second.txt。期待値変更なし、関連再実行と全件再実行で成功 |
| node --test --test-name-pattern='manual map zoom\|Phase 3 visual' scripts/browser-check.mjs | 3/3。PC画像がmobileだった新規テスト設定漏れを発見しdesktop指定へ修正。phase3-browser-related.txt |
| npm run test:browser（popup/失敗追加） | 32/32。phase3-browser-third.txt |
| 最終 npm test | 93/93、fail0 skip0。phase3-unit-final.txt |
| 最終 npm run test:browser | 33/33、fail0 skip0。phase3-browser-final.txt |
| 最終 npm run build | 成功。phase3-build-final.txt |
| rg --files -g '*.js' -g '*.mjs'（node_modules/artifacts/dist除外）→各node --check | 14/14成功 |
| git diff --check | 終了0（LF/CRLF予定通知のみ） |
| node artifacts/phase3-live.mjs baseline | 本番390/1440 smoke、既存8行hash、型/一方向Relation、公開API境界成功。phase3-live-baseline.json、phase3-production-baseline-390.png / -1440.png |
| 既存Wrangler実体 deployments status --json | 変更前deployment/version/100% trafficを確認 |
| node artifacts/phase3-live.mjs schema | 許可option/4列のみ追加、既存schema/options保持・既存8行hash一致。phase3-schema.json |
| node artifacts/phase3-live.mjs samples | 11行Publish=false、既存8行hash一致。phase3-sample-creation.json |

通常のブラウザシナリオはconsole error/uncaught error 0。Leaflet/タイル/API失敗注入時のブラウザnetwork errorは明示条件だけ許容する。過去の失敗ログを削除せず原因と修正を記録した。

実画像確認: phase3-free-390.png / -1440.png、phase3-candidate-390.png / -1440.png、phase3-detour-390.png / -1440.png、phase3-text-200-390.png / -1440.png、phase3-location-390.png / -1440.png、phase3-location-error.png、phase3-external-map-error.png。候補、寄り道、現在地、第三者送信、エラー文言に横溢れ・重なり・操作不能なし。200% mobileは既存の地図最小相当表示で操作領域を確保する。Phase 1・2画像も全件回帰で再生成。

## Notion変更履歴（JST）

対象は既存Travel Itinerary System内のItinerary ItemsとPlaces。新DB/Data Source/Placeは作成していない。変更前のschema/options/公開件数はPHASE3_PLAN.md。内部ID・Secretを報告/Gitへ記録しない。

| 変更対象 | 時刻（2026-10-12） | 目的 / 確認状態 |
| --- | --- | --- |
| Structure option Flexible Block | 18:51:27.988 | 自由時間。既存Item/Alternative Group/SeriesのID/名称/色を保持 |
| Opening Hours | 18:51:27.988 | rich_text追加、公開用営業時間 |
| Detour For | 18:51:27.988 | Items自身へのsingle_property（一方向）relation追加 |
| Additional Duration Minutes | 18:51:27.988 | number追加、寄り道の追加時間 |
| Rejoin Place | 18:51:27.988 | Placesへのsingle_property（一方向）relation追加 |
| [Phase3 Sample] 自由時間 | 18:53:19.706 | Flexible Block、2026-11-15 13:00–15:00 JST、作成時false |
| [Phase3 Sample] 寺の候補 | 18:53:20.063 | 上記の時刻未定子Item、所要30分/営業時間/費用、作成時false |
| [Phase3 Sample] 駅の候補 | 18:53:20.428 | 上記の時刻未定子Item、所要20分、作成時false |
| [Phase3 Sample] 移動 | 18:53:20.764 | 新規Transit、同日10:00–11:00、作成時false |
| [Phase3 Sample] 次の固定予定 | 18:53:21.090 | 同日11:30–12:00、作成時false |
| [Phase3 Sample] 単独寄り道 | 18:53:21.437 | 新規TransitへのDetour For、追加10分/所要10分、作成時false |
| [Phase3 Sample] 系列寄り道 | 18:53:21.785 | 新規Series寄り道、追加40分/明示復帰地点、作成時false |
| [Phase3 Sample] 系列の子 | 18:53:22.158 | 上記Seriesの時刻未定Item、作成時false |
| [Phase3 Sample] 比較寄り道 | 18:53:22.509 | 新規Alternative Group寄り道、追加30分、作成時false |
| [Phase3 Sample] 比較案A | 18:53:22.873 | 上記の公開候補検証用Item、作成時false |
| [Phase3 Sample] 比較案B | 18:53:23.206 | 上記の候補検証用Item、作成時false |

時刻はAPI応答後の操作記録時刻。サンプルは新規同士だけでParent/Detour Forを完結し、既存公開Placesを参照。既存行/既存Relation/既存option/プロパティの削除・archive・rename・型変更・clearなし。既存8行のcanonical properties hashは新規4空列とsystem Last editedを除外して比較し一致。内部IDはhash入力のメモリ内にだけあり、証拠ファイルは名称とhashのみ。

注意: Phase 2報告書では最終falseだが、開始時の実Notion/本番APIはPhase 2サンプル5行がtrueだった。RESTとconnector双方で確認し、既存行read-onlyの指示に従って一切変更していない。Phase 3の後片付け対象には含めない。開始時の公開8件を復帰基準とする。

## Git・非破壊復旧

baseline branch codex/phase3-20261012-182749、commit 65eb5e8b3e79bdf2c39de84fe87d7deb42417cd5、annotated tag phase3-baseline-20261012-182749。作成18:27:53 JST、origin branch/tag/peeled SHA一致を確認してから変更開始。詳細はPHASE3_PLAN.md。

checkpoint b98f2e5（同期/モデル/追加41テスト/計画）push済み。最終実装commit・PRは本番結果とともに追記する。force-push/rebase/remote削除/既存branch履歴書換えなし。

復旧手順（実行時は日時と新規checkout名を採番）:

```powershell
git worktree add -b recovery/phase3-YYYYMMDD-HHMMSS ../phase3-recovery phase3-baseline-20261012-182749
# 新worktreeへ移動。Node実体とnpm-cli.js、プロセス限定PATHを使用
npm ci
npm test
npm run test:browser
npm run build
# 同じwrangler.jsonc / travel-itinerary / 既存accountのみ
wrangler deploy --dry-run
wrangler deploy
```

元worktreeはresetしない。サンプルはallowlistの新規Phase 3行だけPublish=falseに戻す。追加schemaは残し、baseline codeで無視できる。60秒クールダウン後再取得し、API/画面/キャッシュのサンプル0、公開8件、既存hash一致、旧版smokeを確認する。既存Workerの直前versionへCloudflare rollbackを行う場合も同じ検証が必要。rollback後にPhase 3完了とはしない。

## 本番・外部最終状態

更新前Worker travel-itinerary、URL https://travel-itinerary.baribaritozan.workers.dev 、deployment 7c5ad00b-005b-43a6-9f83-4f606d4b144a、version 87cc8434-86d1-49d4-8f91-a81788237157（100%）。変更前390/1440 smokeと公開8件/安定ID境界は成功。

デプロイと本番smokeは未実施。Phase 3サンプルは11件全false。PR未作成。これらの証拠が揃うまでGoalは完了にしない。

## 変更ファイル・制約

scripts/notion.mjs、public/model.mjs、public/app.js、public/styles.css、tests/phase3-sync.test.mjs、tests/phase3-model.test.mjs、scripts/browser-check.mjs、README.md、docs/DEPLOYMENT.md、docs/PHASE3_PLAN.md、docs/PHASE3_REPORT.md。SPECIFICATION.md、既存6単体/統合テスト、Worker/公開更新境界、wrangler設定、依存バージョンは変更していない。artifactsの画像/ログ/実環境検証スクリプトはGit対象外。

実機iOS/Safariの追加互換検証、外部地図/CDN/第三者サービスの将来稼働保証は対象外。必須条件は固定テスト座標、Chromeのタッチ/キーボード、失敗注入で検証する。未実施の本番検証を成功扱いにしない。
