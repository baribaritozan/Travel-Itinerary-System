# Phase 1 のデプロイと Notion UI 設定

2026-10-08時点の実装に対応。Worker名は `travel-itinerary`、公開旅行は `wrangler.jsonc` の `DEFAULT_TRIP_SLUG`（現在 `sample-trip`）。GitHubへのpushとCloudflareへのデプロイは別の操作。このリポジトリにはGitHub Actionsによる自動デプロイはない。

## 既存環境をPhase 1へ更新する場合

既存のWorker、Notion Connection、4DB、Webhookが動いている場合は、そのまま利用する。DB再作成、追加のDurable Object migration、Webhook再作成は不要。新しい任意列を利用しなければNotionの構造変更も不要。

1. 下記の検証・デプロイコマンドをリポジトリ直下で実行する。
2. 公開サイトを再読み込みし、カードの「詳細を開く」、下部の「旅程・地図・比較・その他」、モバイルの「地図」内にサイズ操作が表示されることを確認する。
3. データの公開範囲を確認後、サイトの「Notionから再取得」を操作する。これは最新のNotionデータを読み取り、Workerキャッシュを更新する。新しい任意列もこの再取得から反映される。
4. 更新から60秒以内はキャッシュになる。最終同期日時とサイトの警告を確認する。単なるページ再読み込みは、既存キャッシュがあればNotionを再取得しない。

```powershell
npm ci
npm test
npm run test:browser
npx wrangler whoami
npx wrangler deploy --dry-run
npx wrangler deploy
```

`test:browser` はビルドも実行し `dist/` を生成する。ビルドだけなら `npm run build`。Cloudflare認証がまだなら、本人のブラウザで `npx wrangler login` を完了してから `whoami` でアカウントを確認する。実際の公開URLはdeployの出力を使用する。

Wranglerは `wrangler.jsonc` を読み、Workerと `dist/` の静的UIをまとめて配置する。既存の暗号化Secretはdeployで削除されない。一方、通常の変数はローカル設定の影響を受けるため、公開Slugの変更は `wrangler.jsonc` にも反映する。[Cloudflare deploy](https://developers.cloudflare.com/workers/wrangler/commands/workers/)、[設定](https://developers.cloudflare.com/workers/wrangler/configuration/)を参照。

### Voltaのshimが起動しない場合

インストール済みNode.js 24以上を直接指定する。この指定は今開いているPowerShellプロセス内だけで、OS/Volta設定は変更しない。

```powershell
$node24 = Join-Path $env:LOCALAPPDATA 'Volta\tools\image\node\24.21.0\node.exe'
$npm24 = Join-Path (Split-Path $node24) 'node_modules\npm\bin\npm-cli.js'
$env:Path = (Split-Path $node24) + ';' + $env:Path
& $node24 --version
& $node24 $npm24 ci
& $node24 $npm24 test
& $node24 $npm24 run test:browser
& $node24 $npm24 exec -- wrangler whoami
& $node24 $npm24 exec -- wrangler deploy --dry-run
& $node24 $npm24 exec -- wrangler deploy
```

Nodeのバージョン/保存場所が異なる場合は、存在する24以上の実体へ置き換える。初回のWrangler取得はnpmが確認を求める場合がある。

## Cloudflare Dashboardの設定

`Workers & Pages → travel-itinerary → Settings → Variables and Secrets → Add` で、下表を **Secret** として設定する。既に設定済みなら再入力しない。[公式Secret設定](https://developers.cloudflare.com/workers/configuration/secrets/)

| 名前 | 設定する内容 |
| --- | --- |
| NOTION_TOKEN | 既存のInternal Connectionのトークン |
| NOTION_TRIPS_DATA_SOURCE_ID | TripsのデータソースID |
| NOTION_PLACES_DATA_SOURCE_ID | PlacesのデータソースID |
| NOTION_ITEMS_DATA_SOURCE_ID | Itinerary ItemsのデータソースID |
| NOTION_PUBLISH_REQUESTS_DATA_SOURCE_ID | Publish RequestsのデータソースID |
| NOTION_WEBHOOK_VERIFICATION_TOKEN | Webhookの検証時に受け取ったトークン |

通常変数 `DEFAULT_TRIP_SLUG` は公開するTrips行の `Slug` と一致させる。旅行名ではなく `sample-trip` のような小文字英数字・ハイフンの値。今回は固定された1旅行だけを公開する。

Durable Object bindingは `ITINERARY_STATE → ItineraryState`。既存 `v1` migrationをそのまま保持する。新規環境の初回はwranglerがこのmigrationを適用する。地図はLeaflet/OpenStreetMapを利用し、地図APIキーは不要。

## Notion ConnectionとDBの公開対象

NotionのDeveloper portalで既存のInternal Connectionを選び、Read contentを有効にする。Publish Requestsの処理結果を書き戻すためUpdate contentも必要。親の `Travel Itinerary System` ページまたは4DBへ、そのConnectionのアクセスを許可する。Notionページ自体をインターネット公開する必要はない。[Internal connections](https://developers.notion.com/guides/get-started/internal-connections)

データソースIDは、各DBの設定メニューの `Manage data sources / データソースを管理 → Copy data source ID` から取得できる。DBのURLやビューIDを代わりに設定しない。[NotionのID取得手順](https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03)

Trips / Places / Itinerary Itemsは `Publish` がオンの行だけを読み取る。旅程の参照先PlaceもPublishオンにする。DBビューのフィルターや列の非表示は公開制御にならない。Webに出す情報はPublishと公開フィールドで決まる。

既存の列名を下記へ対応させる。列名はコードと一致させ、大文字・空白も維持する。既存DBが一致していれば追加設定は不要。

| DB | 基本の列名・型・入力 |
| --- | --- |
| Trips | `Trip` タイトル、`Slug` テキスト、`Period` 日付範囲、`Timezone` テキスト（例 `Asia/Tokyo`）、`Publish` チェックボックス。`Status`は任意Select/Status |
| Places | `Place` タイトル、`Latitude` / `Longitude` 数値、`Publish` チェックボックス。任意: `Address` / `Public Notes` テキスト、`Maps URL` / `Website` URL、`Phone` 電話 |
| Itinerary Items | `Item` タイトル、`Trip` Relation→Trips、`Period` 日付/時刻範囲、`Type` Select、`Publish` チェックボックス。通常項目は `Place` Relation→Places、移動は `From` / `To` Relation→Places。任意: `Order` 数値、`Status` / `Transport` Select/Status、`Public Notes` テキスト、`Navigation URL` / `Reservation URL` URL |
| Publish Requests | `Request` タイトル、`Trip` Relation→Trips、`Status` **Select**（`Queued`, `Published`, `Error`）、`Processed At` 日付、`Error` テキスト |

Publish Requestsの `Status` は、Notionの専用「ステータス」型ではなく **Select** にする。Workerが結果を `select` として書き込むため。Trips/Itinerary Itemsの読み取り側のStatusは両型に対応する。

旅行のTimezoneは必須。各予定の開始/終了はNotionの日付欄で時刻とタイムゾーンを設定する。通常の旅行では旅行Timezoneに揃える。終了は開始より前にしない。日付だけの予定は「終日」として表示される。

`Type` の移動は **Transit**、場所不要のメモは **Note**。この2値は処理を切り替えるため英語値を使う。その他の表示例は `Meeting`, `Sightseeing`, `Meal`, `Stay`, `Activity`。日本語の見た目はWeb側で変換する。`Status` は `Confirmed`, `Tentative`, `Candidate`, `Cancelled`、`Transport` は `Walk`, `Train`, `Bus`, `Car`, `Ferry` が表示変換に対応する。

### Phase 1で追加できる任意列

Itinerary Itemsのプロパティ追加メニューから、必要なものだけ追加する。未追加/未入力でも利用可能。費用は公開してよい金額だけを入力する。

| 列名 | 型 | 入力例・表示 |
| --- | --- | --- |
| Reservation Status | Select / Status | `Required` 予約必要、`Pending` 手配中、`Booked` 予約完了、`Not Required` 予約不要 |
| Duration Minutes | Number | `30`（終了日時がないとき概要に30分） |
| Total Cost | Number | グループ全体の金額 |
| Per Person Cost | Number | 1人あたりの金額 |
| Currency | Select | `JPY`、`USD` 等。未設定時は通貨未指定と表示 |

入力後にWebの再取得を行う。カード概要に予約状態・費用、詳細に全体/1人あたりの費用が表示される。予約番号・暗証番号等はPublic NotesやURLへ入力しない。

### Notionでの運用ビュー（任意）

ビューの表示設定はWebの見た目を変更しない。Notionで管理しやすくするため、Itinerary Itemsのテーブルビューを `Trip=対象旅行` で絞り、`Period` 昇順→`Order` 昇順→`Item` 昇順にする。Publish/Status/Reservation Statusを見える列に置く。Publish RequestsにはRequest/Trip/Status/Processed At/Errorを表示して更新結果を確認する。

## Notionの「旅程サイトを更新」ボタン

既存ボタンが動いていればそのまま使う。未設定なら親ページで `/button` を追加する。

1. 名前を「旅程サイトを更新」にする。
2. アクション `Add page to / ページを追加` の追加先にPublish Requestsを選ぶ。
3. 新しい行の `Request=旅程サイトを更新`、`Trip=公開対象旅行`、`Status=Queued` を設定する。
4. 保存する。クリックで作られた行がConnection Webhookの契機になる。

この方式は、ボタンの有料アクション `Send webhook` を使用しない。ボタンと `Add page to` の設定は[Notion公式ボタン説明](https://www.notion.com/help/buttons)を参照。

## Connection Webhook（初回のみ）

Workerを先に公開し、Developer portalのConnection設定 `Webhooks → Create a subscription` へ進む。

1. URLに **deploy出力の公開URL + `/api/notion-webhook`** を指定する。READMEに記載された既存候補は `https://travel-itinerary.baribaritozan.workers.dev/api/notion-webhook`。公開URLはアカウントの設定によるため実際のdeploy出力を優先する。
2. Event typeに `page.created` を選びSubscriptionを作成する。
3. CloudflareのWorkerリアルタイムログ、または `npx wrangler tail` で受信した `verification_token` を確認する。
4. 同じ値をCloudflareのSecret `NOTION_WEBHOOK_VERIFICATION_TOKEN` に保存する。
5. NotionのVerifyへ値を貼り付け、Subscriptionを有効化する。

認証済みの既存Subscriptionを使う場合は再作成不要。再作成した場合は検証トークンも変わるのでSecretを更新する。トークンは署名検証に使用する。[Notion公式Webhook手順](https://developers.notion.com/reference/webhooks)

この実装は、共有されたPublish Requests内の `page.created` だけを更新要求として扱う。予定を編集しただけでは同期しない。Web再取得またはNotion更新ボタンを操作する。Webhook配信は非同期で、即時とは限らない。処理結果はPublish Requestsへ書き戻されるが、60秒クールダウン中は新しい同期を実行しない場合がある。実際の最新性はWebの最終同期日時と警告も合わせて確認する。

## 公開後の確認

公開サイトを390px相当とPCで開き、日付・詳細・地図フォーカス・モバイル3段階を確認する。`GET /api/itinerary` がJSONを返し、最終同期が表示されることを確認する。任意列を利用する場合は再取得後の概要/詳細に反映されることを確認する。

| 症状 | 確認箇所 |
| --- | --- |
| デプロイ後も旧UI | Worker名・アカウント、ビルド済みdist、ブラウザ再読み込み |
| 旅程初回取得失敗 | Secrets、Connectionアクセス、Data Source ID、Trips.Slug/Publish、Timezone/Period |
| 古いキャッシュの警告 | Cloudflareログのデータ検証エラー、関連PlaceのPublish、日時・座標。修正後に再取得 |
| Notion更新ボタンで行が作られない | ボタンの追加先と本人のDB編集権限 |
| Publish RequestsがQueuedのまま | Webhookの有効化、page.created、Connectionのアクセス、検証Secret |
| 結果の書き戻し失敗 | ConnectionのUpdate content、Publish Requests.StatusがSelectか、Processed At/Errorの型 |
| 日付や時刻が想定と違う | Trips.TimezoneとNotion Periodのタイムゾーン |
| 地図だけ読み込めない | Leaflet CDN/OSMの通信。旅程詳細の外部地図リンクは利用可能 |

本手順書の追加時点では、Cloudflareへのデプロイ・Notion UI/DB/Secretの変更は実施していない。

## Phase 2 へ更新する場合

1. Itinerary Itemsで `Structure` を **Select** 型として追加し、英語の正規option `Item` / `Alternative Group` / `Series` を設定する。同名列がある場合は型・optionを確認して再利用し、重複列を作らない。
2. `Parent` を **Relation** 型として追加し、参照先に同じ **Itinerary Items** を選ぶ。逆方向プロパティは不要なので一方向にする。Notion UIで選択可能なら1ページに制限する。APIでも0または1件を検証する。
3. 既存の通常項目はStructure未設定をItemと解釈するため、既存行を一括更新しない。新規のグループ/系列だけStructureを指定し、新規子のParentにその親を登録する。Tripは親子で同じ旅行を明示する。
4. 公開グループには2件以上の公開直接候補（Item/Series）、系列には1件以上の公開直接Itemを登録する。最大はAlternative Group→Series→Item。子を公開する場合は親も公開する。
5. 親Periodを空にすると公開子から代表期間を算出する。設定済みPeriodは子全体を包含させる。親のStatus/Type/費用/場所は独立し、子へ継承しない。通常ItemのPeriodと場所、TransitのFrom/ToはPhase 1と同じ。
6. `npm test`、`npm run test:browser`、`npm run build`、全JS/MJSの `node --check`、`git diff --check` を実行し、画像を確認する。既存wrangler.jsoncを使って `npx wrangler deploy --dry-run` → `npx wrangler deploy` を実行する。
7. 本番の「Notionから再取得」でstructure/parentIdをキャッシュへ反映する。60秒クールダウン中は待ち、staleの場合は不正階層や期間を確認する。既存のDO・Secret・Webhook・Data Sourceはそのまま利用する。

復旧点のbranch/tagと本番versionを更新前に記録する。復旧にはbaseline tagから新しいworktree/復旧branchを作り、検証・build後、既存Workerへデプロイする。元checkoutをresetしない。追加した任意プロパティはbaseline codeが無視できるので残す。検証用の `[Phase2 Sample]` 行は最終Publish=falseに戻し、再取得後の本番API/画面から消えたことを確認する。

このタスクで実施したスキーマ追加・サンプル・本番version・smoke結果は [PHASE2_REPORT.md](./PHASE2_REPORT.md) に記録する。既存行・既存プロパティの削除、名前/型変更、値clearは行わない。

## Phase 3 へ更新する場合

1. 変更前に専用branch、baseline commit、annotated tagを作ってoriginへpushし、対象DB、既存公開行のsanitized hash、本番deployment/versionとsmokeを記録します。既存worktreeをreset/stashしません。
2. 既存Structure Selectの全optionを保持して英語の正規値 `Flexible Block` を追加します。`Opening Hours`（Rich Text）、`Additional Duration Minutes`（Number）を追加します。`Detour For`は同じItinerary Items、`Rejoin Place`はPlacesへのRelationです。どちらも一方向（RESTではsingle_property）とし、0または1件。Notion UIで可能なら1ページ制限を設定します。同名プロパティがある場合は型・Relation先・方向を確認して再利用し、不一致なら変更せず停止します。[NotionのRelation schema](https://developers.notion.com/reference/property-object)を参照。
3. 自由時間はFlexible Block自身に開始・終了Periodが必須、直接子はItemのみ。子はPeriodなしで登録でき、Order→Status→名称の候補一覧になります。親の場所・費用・状態は暗黙継承しません。Alternative Group→Series→Flexible Block→Itemまで許可します。空コンテナ、循環、禁止階層等は同期エラーです。
4. 寄り道ルートのStructureはItem/Series/Alternative Group。Parentを空にし、Detour Forを同じ旅行の公開Item/Transitへ設定します。対象TransitをParentにしません。追加所要時間は0以上、復帰地点は任意で、省略時は対象のTo。子孫のDetour Forと寄り道内Flexible Blockは禁止。Periodなしの寄り道末端ItemはDuration Minutes（0以上）が必須です。通常ItemのPeriod要件は変わりません。
5. 現在地はHTTPSかつ対応ブラウザで明示操作時に一回だけ取得します。`public/_headers` のPermissions-Policyは `camera=(), microphone=(), geolocation=(self)` とし、同一originの位置取得を許可します。`geolocation=()` ではブラウザ権限があっても取得できません。メモリ内だけで保持し、再読み込みで破棄、5分超で古い情報とします。保存/ログ/分析/サーバー送信/継続追跡を追加しないでください。Google Maps送信は第三者送信表示のある経路操作時だけです。固定HTTPS Directions URL、許可パラメーターとnoopenerを維持してください。
6. 全既存・追加テスト、build、全JS/MJS構文、diffチェック、390×844/1440×900/200%画像確認を成功させてcommit/pushします。そのcommitで既存wrangler.jsoncを使い `wrangler deploy --dry-run` → `wrangler deploy`。Worker/account/environment/domain/Secretを新設しません。
7. 検証専用の新規 `[Phase3 Sample]` はPublish=falseで作り、関係を新規サンプル内で完結させます。明示的な将来日付を使用します。本番smoke時のみallowlist/try-finallyで短時間公開し、既存60秒クールダウンを守って再取得します。既存行（Phase 2サンプルも含む）は変更しません。
8. 本番で自由時間・3構造の寄り道・余裕・選択/フィルター/地図時間・既存操作・再取得・地図失敗時継続を確認します。現在地は固定テスト座標/権限エミュレーションを使い、経路popupを捕捉して外部通信を遮断します。全Phase 3サンプルをfalseへ戻して再取得し、API/画面/キャッシュの消滅と既存公開行hash一致を確認します。サンプルや追加列を削除/archiveしません。

復旧はbaseline tagから別worktreeと新規recovery branchを作り、既存Node/npmでtest/browser/build後、同じWorkerへ再デプロイします。元checkoutをresetしません。追加列はbaseline codeが無視できるため保持します。確認済みCloudflare rollbackを使う場合も、smoke/サンプルfalse/既存値一致を再確認します。rollback後はPhase 3完了にしません。具体的なtag/version/コマンド/証拠は [PHASE3_REPORT.md](./PHASE3_REPORT.md) に記録します。
# Phase 4 の運用・復旧

Notion schema・Worker・DO・Secrets・公開slugは変更しません。Leafletは同一originへ同梱しLICENSEも配信します。背景タイルは永続保存しません。iPhone/Androidは対象ですが今回の検証は自動・本番Chromeまでです。

1. `npm test`、`npm run test:browser`、`npm run test:pwa`、build、全JS/MJS構文、diff、390/1440/200%画像確認を行い、検証済みcommitをpushします。
2. 現deployment/versionを記録し、`npm run build:recovery`でbaseline UIと復旧用SWを準備します。
3. 既存設定のまま `wrangler deploy --dry-run` → `wrangler deploy`。本番で新規profile・明示保存・終了後圏外再起動・再接続・予定区間・保存解除を確認します。
4. 通常の新しいUIは「更新があります」から切り替えます。他のタブを閉じてから操作してください。利用者の画面を自動reloadしません。

緊急復旧は `node scripts/recovery-build.mjs phase4-baseline-20261012` で生成した `artifacts/phase4-recovery-wrangler.jsonc` を使い、同じ既存Workerへdry-run/deployします。復旧SWはnetwork-onlyへ切り替え、本アプリcache/DBを消去して登録解除し、開いている同一originの画面を旧UIへ再読み込みします。通常更新とは異なる緊急時の処理です。旧UIとcache/SW退役を確認します。閉じた端末には次回接続時の更新が必要です。Cloudflare旧versionへの切替だけでは既存SWを消せないため、復旧完了としません。元checkoutのresetや既存Notionデータの変更は不要です。

保存期限は30×24時間。同じ `generatedAt` は通常GETが成功しても更新版ではありません。stale/throttled/5xx/timeoutで期限を延長しません。期限切れpayloadは起動/画面復帰/起動中に削除されますが、閉じたアプリで時刻指定の物理削除は保証しません。保存解除はアプリの「保存を解除して削除」を使用してください。

## Phase 5 のローカル確認と操作

Phase 5ではフロントエンドの表示と操作導線だけを更新しています。公開payload、Notion schema、Worker/DO、60秒制限、保存期限、現在地の扱いは従来どおりです。ローカル完了後のユーザー指示で本番公開・GitHub同期を実施しました。Notion変更は行っていません。配信version・復旧点・確認結果は [PHASE5_PUBLISH_REPORT.md](PHASE5_PUBLISH_REPORT.md) を参照してください。

1. `npm test`、`npm run test:browser`、`npm run test:pwa`、`npm run build`を実行します。ブラウザは既存Chrome、データは合成fixtureです。外部経路と背景タイルは検証時に捕捉します。
2. `npm run preview:phase5` → `http://127.0.0.1:4175`。スマートフォンの初期地図は最小です。候補の前後/スワイプ/左右/Home/End、案名の全画面、戻る/Escape、比較、その他を確認します。PCは旅程左・地図右、候補2〜3列です。
3. 「その他」から保存・削除・ホーム画面・再取得へ進みます。通常更新は「アプリ更新待機中」の通知を確認し、「その他 → 端末保存とホーム画面 → 更新があります・切り替える」を明示操作します。他のタブがある場合は閉じて再試行してください。
4. PWAテストは `5115adbe3d4d06b333a9f9e1bd1f4b01cfce8ee4` の旧UIを `artifacts/phase5-baseline-dist` に再ビルドします。元checkoutを変更せず、旧UIで保存した永続profile→更新待機→明示切替→profile終了→圏外再起動を検証します。`git`とそのcommitを含む履歴が必要です。

「その他」へ移した同期・保存の通知は、圏外/stale/失敗/期限切れ/更新待機の際にはメニュー外にも表示します。予約/施設/Google Maps/コピー/寄り道は項目詳細、現在地取得/更新・全体表示は地図内です。保存解除・復旧SWの手順と公開取り下げの制限はPhase 4の規則を維持します。新しいUI状態を保存しません。

Volta shimが失敗する場合は上記のNode 24実体とnpm-cli.jsで各scriptを実行できます。localhost通信がsandboxで遮断される場合はブラウザ検証のローカル通信に必要な実行権限を使用します。OS設定変更は不要です。検証環境・画像・AC対応・実機未確認の範囲は [PHASE5_REPORT.md](PHASE5_REPORT.md) を参照してください。
