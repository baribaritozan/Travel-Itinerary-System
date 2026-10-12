# Phase 3 実装・検証報告

正式要求はSPECIFICATION.md v0.4。実施日2026-10-12、Asia/Tokyo。FR-18〜FR-21、受け入れ基準1〜16の実装、ローカル全検証、本番デプロイとsmoke、Notionサンプルの後片付けを完了。GitHub PRの作成情報は下記Git節に記録する。sanitized実環境証拠は [PHASE3_EVIDENCE.json](PHASE3_EVIDENCE.json) に保存した。

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
| 11 | 現在地専用layer、status、expiry timer、_headersの同一origin許可 | browser成功/精度/時刻/専用marker/circle、denied/timeout/unavailable/insecure/unsupported、5分超で古い表示・更新案内。追加の実Geolocation API＋権限エミュレーションで配信Permissions-Policyも検証 |
| 12 | currentLocationメモリ変数、payload/state/storage/logと独立 | browser Storage/IndexedDB/Cache/Service Worker空、request/consoleへテスト座標なし、reloadでmarker/位置要求0。appの保存/サーバー送信経路なし |
| 13 / FR-21 | resolveDestination/buildDirectionsUrl、明示buttonからwindow.open | model全構造、全travelmode、公開住所encoding、固定origin/許可パラメーター。browser「Directions all structures」通常/Transit/自由時間子/寄り道/Series/active group、無効理由、実popup opener=null。現在地は操作時にのみURLへ追加、第三者送信文言あり |
| 14 | 失敗状態を旅程stateと独立、外部経路catch | browser位置取得全失敗でも選択可、「map/external failure」でLeaflet遮断/外部popup例外でも候補詳細・選択・既存地図リンク継続 |
| 15 | 既存CSS色/余白/リング/native controls/ariaを拡張 | 390×844、1440×900、200%文字、reduced motion、44px測定、Tab/Enter/Space/矢印、横溢れなし。実際に画像を開いて確認 |
| 16 / FR-01〜17 | 既存6テストファイルと既存browser20件を保持 | 既存52 + 追加41 = 93件、既存20 + 追加15 = 35件。既存testsファイルのbaselineとの差分0。既存browser期待値は全保持。scrollテストはnative通知を観測してから擬似時計を進める同期だけ追加。open helperに任意initScript、fixture serverへ実配信ヘッダーを適用 |

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
| 既存Wrangler deploy --dry-run → deploy（commit 656ff3e） | 成功、phase3-deploy-dry-run.txt / phase3-deploy.txt。初回version 4a30f2a7-906f-479f-9cad-3e2e59b1d629 |
| node artifacts/phase3-live.mjs live 656ff3eae9cf47db1e9806421f5e60a177e354bd | 実位置取得がPermissions-Policyに拒否されsmoke失敗。finallyで全11行false・API/画面/キャッシュ除去・8行hash一致。phase3-production-first-failed.json / -command.txt |
| wrangler rollback --help → rollback 87cc8434-86d1-49d4-8f91-a81788237157 --yes --message ... | 正式help確認後、既存直前versionへ復旧成功。phase3-rollback.txt |
| node artifacts/phase3-live.mjs audit; wrangler deployments status --json | 390/1440 smoke、公開8件、サンプル0、11行false、hash一致。phase3-rollback-smoke.json / phase3-rollback-status.json |
| node --test --test-name-pattern='Phase 3 real Geolocation' scripts/browser-check.mjs | 実配信ヘッダー適用後、禁止設定で1/1失敗を再現。phase3-permissions-red.txt。モック成功だけでは設定を検証できないことを修正 |
| 修正後 npm test / npm run test:browser / npm run build / 全node --check / git diff --check | 93/93、34/34、fail0 skip0、build/14構文/diff成功。phase3-unit-after-policy.txt / phase3-browser-after-policy.txt / phase3-build-after-policy.txt。実API＋許可済み固定座標でも成功 |
| 既存Wrangler deploy --dry-run → deploy（commit 18f1178） | 成功。phase3-deploy-policy-dry-run.txt / phase3-deploy-policy.txt |
| node artifacts/phase3-live.mjs live 18f11785e8821e29abcc2f62c608e54908bee7f0 | mobile/PC成功、Leaflet遮断条件で候補scrollの遅延callbackがfilter後の消えたgroupを参照し失敗。finallyで全11行false・API/画面/キャッシュ除去・8行hash一致。phase3-production-second-failed.json / -command.txt |
| wrangler rollback 87cc8434-86d1-49d4-8f91-a81788237157 --yes --message ...; node artifacts/phase3-live.mjs audit | 2回目の復旧成功、390/1440 smoke、公開8件/サンプル0/11行false/hash一致。phase3-rollback-second.txt / phase3-rollback-smoke.json |
| node --test --test-name-pattern='pending candidate scroll' scripts/browser-check.mjs（修正前） | detached carouselの遅延通知で1/1失敗を再現。phase3-candidate-race-red.txt。isConnected/現行group/現行candidateの検査を追加 |
| 修正後 npm test / npm run test:browser | 93/93、34/35。新規競合テスト成功、既存scrollテストの断続失敗。phase3-unit-after-race.txt / phase3-browser-after-race.txt |
| scrollイベント時刻の診断、関連2テストを8回実行 | native scroll通知が擬似clock.runForの後に届く失敗を再現。通知を観測してからclockを進める同期だけ追加し、2件×8回すべて成功。既存の50ms中の地図不変・300ms後focus・700ms後の安定・pan高々1回を全保持 |
| 最終修正後 npm test / npm run test:browser / npm run build / 全node --check / git diff --check | 93/93、35/35、fail0 skip0、build/14構文/diff成功。phase3-unit-final-validated.txt / phase3-browser-final-validated.txt / phase3-build-final-validated.txt。既存6テストと仕様のbaseline差分0 |
| 既存Wrangler deploy --dry-run → deploy → deployments status --json（commit c54c5c9） | 成功、version 32964f5b-749a-4af1-a811-2e55eaf1bba6、100%。phase3-deploy-final-dry-run.txt / phase3-deploy-final.txt / phase3-deployment-validated-status.json |
| node artifacts/phase3-live.mjs live c54c5c90b7eea717b1ec9e89e37c8567ff84064b | 390/1440/390+Leaflet遮断すべて成功、全11行false・API/画面/キャッシュ除去・8行hash一致。phase3-production-results.json / phase3-production-final-command.txt |
| node artifacts/phase3-live.mjs audit（最終、read-only） | 19:28:03.741 JST、390/1440画面、公開8件/サンプル0/全11行false/hash一致を再確認。phase3-final-state-audit.txt / .json |
| git -c credential.username=baribaritozan -c credential.interactive=false push origin codex/phase3-20261012-182749; git ls-remote ... | c54c5c9到達確認。GCM複数アカウントの無指定pushは停止し中断、無指定非対話は認証失敗。登録済み所有アカウントをプロセス限定で指定して解消。認証情報/OS設定変更なし |

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

一時公開の目的は実Notion→Worker同期→公開画面の検証。以下は各行の `true → false` 操作時刻（2026-10-12 JST）。名称はすべて `[Phase3 Sample]` 接頭辞付き。各回ともfinallyでfalseへ戻し、削除・archiveなし。秒未満を含む各API操作応答時刻はPHASE3_EVIDENCE.jsonのpublicationRuns.changesに保存。

| サンプル | 初回 true → false | 2回目 true → false | 最終 true → false | 最終Publish |
| --- | --- | --- | --- | --- |
| 自由時間 | 19:03:47 → 19:04:03 | 19:11:54 → 19:12:07 | 19:24:45 → 19:25:03 | false |
| 寺の候補 | 19:03:46 → 19:04:03 | 19:11:53 → 19:12:07 | 19:24:45 → 19:25:04 | false |
| 駅の候補 | 19:03:46 → 19:04:04 | 19:11:53 → 19:12:08 | 19:24:44 → 19:25:04 | false |
| 移動 | 19:03:46 → 19:04:04 | 19:11:53 → 19:12:08 | 19:24:44 → 19:25:04 | false |
| 次の固定予定 | 19:03:44 → 19:04:04 | 19:11:52 → 19:12:08 | 19:24:44 → 19:25:05 | false |
| 単独寄り道 | 19:03:44 → 19:04:05 | 19:11:52 → 19:12:09 | 19:24:42 → 19:25:05 | false |
| 系列寄り道 | 19:03:42 → 19:04:05 | 19:11:52 → 19:12:09 | 19:24:42 → 19:25:05 | false |
| 系列の子 | 19:03:42 → 19:04:07 | 19:11:51 → 19:12:09 | 19:24:41 → 19:25:06 | false |
| 比較寄り道 | 19:03:41 → 19:04:07 | 19:11:51 → 19:12:10 | 19:24:40 → 19:25:06 | false |
| 比較案A | 19:03:41 → 19:04:08 | 19:11:51 → 19:12:10 | 19:24:40 → 19:25:06 | false |
| 比較案B | 19:03:41 → 19:04:08 | 19:11:50 → 19:12:10 | 19:24:39 → 19:25:07 | false |

## Git・非破壊復旧

baseline branch codex/phase3-20261012-182749、commit 65eb5e8b3e79bdf2c39de84fe87d7deb42417cd5、annotated tag phase3-baseline-20261012-182749。作成18:27:53 JST、origin branch/tag/peeled SHA一致を確認してから変更開始。詳細はPHASE3_PLAN.md。

checkpoint b98f2e5（同期/モデル/追加41テスト/計画）、656ff3e（UI/テスト/文書）、18f1178（実配信Geolocation policy修正）、c54c5c9（候補scroll競合修正/最終全検証）を専用branchへpush済み。最終デプロイ対象は c54c5c90b7eea717b1ec9e89e37c8567ff84064b。報告・sanitized証拠commitは 02e4a67c5037db4cdb84c74f4b873b2922ccf5e6。以後の報告・証拠更新はdocsのみで、配信コードとの差分はない。force-push/rebase/remote削除/既存branch履歴書換えなし。

GitHub PR: **[#2 Phase 3 柔軟な当日運用を実装](https://github.com/baribaritozan/Travel-Itinerary-System/pull/2)**。19:32:11 JST作成、base main、head codex/phase3-20261012-182749、open、非draft、未merge。本chatへPRをattach済み。作成直前にorigin/mainをfetchし、mainの追加commitなし・merge-treeの競合なしを確認した。作業開始前からローカルにcommitされていた正式仕様v0.4とdocs/PHASE3_GOAL_PROMPT.mdも、origin/mainとの差分に含まれる。本タスクでの仕様変更はbaseline比較で0。PRリンク追記commit a4f384a157f14ebdba7966260bd81e9c0b48aa4fも同じbranchへpushし、origin SHA・PR head・ローカルHEADの一致、PR mergeable=true/未mergeを確認した。

最終読み取り確認: `wrangler deployments status --json` は上記最終deployment/version/100%と一致。配信app.js/model.mjs/styles.cssは検証済みdistと完全一致、ルートの同一origin Geolocation policyも一致。公開APIは8件、Phase 3サンプル0件、全item IDは64桁の公開hash。docs以外はデプロイ対象commitとの差分0、作業ツリーclean。以後はこの確認結果だけをdocsへ追記し、同じbranchへpushした。

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

初回デプロイは19:02:54.094 JST、deployment 9040bf25-bcaa-427f-b727-d5275db5cf81、version 4a30f2a7-906f-479f-9cad-3e2e59b1d629。19:03:39〜19:04:52の実環境smokeで、既存 `Permissions-Policy: geolocation=()` が実API取得を禁止することを検出した。ローカルAPIモックだけではこの配信境界を検証できていなかった。Phase 1・2操作、自由時間、寄り道は動作したが、Phase 3完了とはしない。

全11行の非公開復帰・API/画面/キャッシュ消滅・既存8行hash一致を19:04:52.445に確認後、19:06:04.620に確認済みPhase 2 versionへrollbackした（deployment a3c53bf6-12f9-49ff-b76e-f1dabfdb009b、旧version 100%）。19:06:50.952の390/1440復旧smoke成功、サンプルfalse/消滅/hash一致を再確認した。その後だけ、同一origin許可へのヘッダー最小修正と、実Geolocation＋ブラウザ権限エミュレーションの回帰テストを追加した。camera/microphone禁止は維持する。

2回目のデプロイは19:10:52.003 JST、commit 18f11785e8821e29abcc2f62c608e54908bee7f0、deployment 5a8818d5-8e87-4437-b775-43908cea5696、version d12b4e06-a5dd-4d84-8b90-b5353f77cc6a。19:11:49.856開始のsmokeでmobile/PCは成功し、実APIでの位置取得・メモリ境界・Directions/noopenerも成功した。一方、Leaflet遮断条件で候補切替後にfilterをかけると、遅延scroll callbackが削除済みcarouselを参照してuncaught errorになった。

19:12:59.754に全11行false・API/画面/キャッシュ消滅・既存8行hash一致を確認し、同じ旧versionへ再rollbackした。19:13:58.561の390/1440復旧smokeも成功。削除済みcarouselおよび現行treeにないgroup/candidateを無視する最小修正と、再現回帰テストを追加した。

最終デプロイは19:24:10.142 JST、検証済みcommit c54c5c90b7eea717b1ec9e89e37c8567ff84064b、deployment **afa922c1-0fa9-446e-b104-2c30d479bb31**、version **32964f5b-749a-4af1-a811-2e55eaf1bba6**（100%）。既存Worker/account/environment/Secret/bindings/domainは維持。公開されたapp.jsが検証済みsourceと同一で、Permissions-Policyが同一originの位置取得を許可することを、サンプル公開前に検査した。

19:24:37.586〜19:25:50.920の本番smokeは390×844・1440×900・390×844でLeaflet遮断の3条件すべて成功。実Notion由来の自由時間候補・親子focus/三状態選択・時間範囲・フィルター・寄り道3構造/余裕/超過/明示地図表示・候補変更・現在地の実API成功/拒否・Directions popup/noopener・storage/request/console境界・reload破棄を確認。位置は固定エミュレーションのみで、Google通信は捕捉してテスト座標を送信していない。通常console/uncaught errorは0、意図したLeaflet遮断のnetwork errorだけを区別した。

19:25:07.306までに11件のPublish=false操作を完了。クールダウン後の再取得で19:25:50.920に公開API8件、Phase 3サンプルAPI/画面0件、キャッシュ除去、既存8行hash一致を確認。19:28:03.741のread-only再検査でも全11件false、公開8件/サンプル0、既存hash一致、390/1440画面smoke成功。schemaと非公開サンプルは残し、既存行・Phase 2サンプルは変更していない。最終本番画像も実際に開いて、文字・余白・境界・操作領域を確認した。

## 変更ファイル・制約

scripts/notion.mjs、public/model.mjs、public/app.js、public/styles.css、public/_headers、tests/phase3-sync.test.mjs、tests/phase3-model.test.mjs、scripts/browser-check.mjs、README.md、docs/DEPLOYMENT.md、docs/PHASE3_PLAN.md、docs/PHASE3_REPORT.md、docs/PHASE3_EVIDENCE.json。SPECIFICATION.md、既存6単体/統合テスト、Worker/公開更新境界、wrangler設定、依存バージョンは変更していない。artifactsの画像/ログ/実環境検証スクリプトはGit対象外。Gitへ保存した証拠はschema名/型/向き、既存公開行の名称/hash、サンプル名称/操作時刻/Publish、検証結果、Cloudflare version/deploymentのみで、Notion内部ID・Secret・利用者の実位置を含まない。

実機iOS/Safariの追加互換検証、外部地図/CDN/第三者サービスの将来稼働保証は対象外。必須条件は固定テスト座標、Chromeのタッチ/キーボード、失敗注入で検証済み。未達必須要件・既知の重大回帰・公開中のPhase 3サンプル・復旧不能な外部変更は残っていない。
