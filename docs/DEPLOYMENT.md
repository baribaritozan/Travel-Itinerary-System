# Phase 1 のデプロイと Notion UI 設定

2026-10-08時点の実装に対応。Worker名は `travel-itinerary`、公開旅行は `wrangler.jsonc` の `DEFAULT_TRIP_SLUG`（現在 `sample-trip`）。GitHubへのpushとCloudflareへのデプロイは別の操作。このリポジトリにはGitHub Actionsによる自動デプロイはない。

## 既存環境をPhase 1へ更新する場合

既存のWorker、Notion Connection、4DB、Webhookが動いている場合は、そのまま利用する。DB再作成、追加のDurable Object migration、Webhook再作成は不要。新しい任意列を利用しなければNotionの構造変更も不要。

1. 下記の検証・デプロイコマンドをリポジトリ直下で実行する。
2. 公開サイトを再読み込みし、カードに「詳細を開く」、モバイル地図に「最小・標準・拡大」が表示されることを確認する。
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
