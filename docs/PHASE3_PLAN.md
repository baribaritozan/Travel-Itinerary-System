# Phase 3 実装・検証計画

正式要求: SPECIFICATION.md v0.4（commit f296a893bd458e32fe0e5066a6aaf8f2b668cb86）。仕様書は変更しない。

## Git baseline

開始時main、HEAD 90d5297f93e3e52b838e7488f7d7103e70fda625、clean。未追跡なし。originは既存Travel-Itinerary-System、既定branch main。ユーザー変更の破棄/stash/resetなし。

- 専用branch: codex/phase3-20261012-182749
- baseline commit: 65eb5e8b3e79bdf2c39de84fe87d7deb42417cd5（cleanな開始ソースと同一のempty snapshot）
- annotated tag: phase3-baseline-20261012-182749（tag object e46fb827824ad7d63d5a1fe56fe14630dbf1c88a）
- 作成: 2026-10-12 18:27:53 JST。origin branch/tagとpeeled commit一致をls-remoteで確認後、実装開始。
- sandbox DNS / 認証不足を検出。ユーザーの認証復旧後、既存GCM/通常pushで成功。履歴書換えなし。

## 変更前検証・実環境

Node.js v24.21.0実体と同梱npm-cli.js、プロセス限定PATHを使用。npm test 52/52、fail0 skip0。npm run test:browser 20/20、fail0 skip0。npm run build成功。全JS/MJS 12ファイルnode --check成功。sandboxのlocalhost制限による初回browser失敗は、制限外再実行で解消。artifacts/phase3-baseline-unit.txt、phase3-baseline-browser-unrestricted.txt。

Notion対象はTravel Itinerary System内の既存Itinerary Items / Places / Trips。内部IDは記録しない。Itinerary Items既存22列: Item(title)、Trip/Parent/Place/From/To(relation)、Publish(checkbox)、Period(date)、Order/Duration Minutes/Total Cost/Per Person Cost(number)、Structure/Type/Status/Transport/Currency(select)、Reservation Status(status)、Navigation URL/Reservation URL(url)、Public Notes(rich_text)、Last edited(last_edited_time)。Structure optionsはItem / Alternative Group / Series。Parentは同一Data Sourceへのsingle_property（一方向）。Place/From/ToはPlacesへの一方向。既存optionは全て保持する。Phase 3の4列は未追加。

公開Itinerary 8件（元の通常3件とPhase 2サンプル5件）、Places 2件。Phase 2報告書の最終falseと異なり、現在のPhase 2サンプルはRESTとconnectorの双方で全5件Publish=true、本番APIにも含まれる。既存行は変更せず、8件の現状態を基準に比較する。Phase 3サンプル0件。

既存Worker travel-itinerary、URL https://travel-itinerary.baribaritozan.workers.dev 。変更前deployment 7c5ad00b-005b-43a6-9f83-4f606d4b144a、version 87cc8434-86d1-49d4-8f91-a81788237157（100%）。API 200/hit、8項目/2場所、trip内部IDなし、項目は64桁公開ID。

## 要件・証拠対応

| FR / Phase 3基準 | 実装箇所 | 自動・ブラウザ・実環境証拠計画 |
| --- | --- | --- |
| FR-18 / 1 | notion buildTripPayload/publicTripPayload、model buildTree | Flexible Blockと時刻未定Item、安定ID変換、実Notion→API |
| 2 | 同期時の文脈別Period検証 | 通常Item必須、自由時間/寄り道例外、代表期間・旧payload回帰 |
| 3 | 主階層グラフ検証 | 全許可辺/最大階層、循環/複数親/旅行/孤立/非公開/空/禁止辺 |
| 4 | app自由時間候補一覧 | 時刻ノードなし、Order/Status/名称、公開情報/営業時間 |
| 5 | model filterTree/mapNodes/selection、app独立state | 親子focus/三状態/フィルター/親時間範囲 |
| FR-19 / 6 | 同期Detour For検証 | 型/件数/対象/同一Trip/自己・子孫/子への設定/自由時間禁止 |
| 7 | app Transit詳細内の寄り道 | Item/Series/Alternative Group、アクティブ候補比較、実Notion |
| 8 | model detourAssessment | 同じ表示系列の次固定予定、余裕/超過/判定不可、フィルター不変 |
| 9 | model寄り道関連/明示地図表示 | top-level除外、対象Transitのみでは地図非表示、展開/focus/選択 |
| FR-20 / 10 | app位置取得明示ボタン | 初期/日付/カード/地図要求0、クリック1回につきgetCurrentPosition1回 |
| 11 | app現在地status/専用layer | 成功/拒否/timeout/unavailable/insecure/unsupported、精度/時刻/5分 |
| 12 | 現在地メモリのみ、固定テスト座標 | Storage/request/console監視、reload破棄、watchなし |
| FR-21 / 13 | model目的地解決/Directions URL、app操作 | 全構造/travelmode/encoding/HTTPS/noopener/第三者表示、popup捕捉・通信遮断 |
| 14 | app失敗状態独立 | 位置失敗/外部連携失敗/Leaflet失敗でも旅程継続、本番smoke |
| 15 | styles/native controls/aria | 390×844、1440×900、200%/reduced motion画像を開く、44px/keyboard/横溢れ |
| 16 / FR-01〜17 | 既存全テストと追加テスト | 既存52/20を保持、全件fail0 skip0、build/構文/diffチェック |

## 実装・Notion・デプロイ方針

主階層childrenと副次detoursを分離。時刻未定候補は表示判定だけ親の時間文脈を使用し、実際のstartへ値を継承しない。現在地は独立したメモリ変数とLeaflet layerに保持し、旅程layer/フォーカス/選択と分離。Directions URLは操作時だけ固定HTTPS origin/許可パラメーターから生成する。

テストを先に追加して失敗を確認後、同期→モデル→UIの意味ある単位で実装・checkpoint/push。既存テストを削除/skip/弱体化しない。全テスト後、画像を実際に確認し、README/DEPLOYMENT/REPORTを実装と一致させる。

NotionはStructure option Flexible BlockとOpening Hours(rich_text)、Detour For(同一Itemsへのsingle_property relation)、Additional Duration Minutes(number)、Rejoin Place(Placesへのsingle_property relation)のみ追加。同名列があれば型/対象/向きを検証して再利用。既存プロパティ/option/行は変更しない。既存公開行のsanitized canonical hashを追加前後で比較する（新規空列とsystem編集時刻を除き、既存列の値を比較）。

将来日付の最小[Phase3 Sample]行をPublish=falseで作成し、新規同士だけで関係を完結する。既存公開Placeは読み取り参照。allowlist/try-finallyで一時公開後falseへ戻し、60秒クールダウン後に再取得しAPI/画面/キャッシュから除去を確認する。Phase 2サンプルには触れない。

検証成功したcommitだけ既存wrangler.jsoncで正規dry-run→既存Workerへdeploy。本番smokeも固定座標とpopup捕捉を使い、外部送信を遮断。全検証後最終push/PR作成、mergeしない。

復旧は `git worktree add -b recovery/phase3-YYYYMMDD-HHMMSS ../phase3-recovery phase3-baseline-20261012-182749`、新worktreeでnpm ci/test/browser/build、同じWorkerへdeploy。元worktreeをresetしない。追加列は残す。重大回帰時は先に復旧、smoke/サンプルfalse/既存値一致を再確認しPhase 3完了にしない。
