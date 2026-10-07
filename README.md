# Notion Itinerary Publisher

Notionを旅程の正本にし、手動実行したGitHub ActionsからCloudflare Workerへスマホ向け静的サイトを公開する最小実装です。

## Notion構成

- Trips：旅行単位の期間、タイムゾーン、公開Slug
- Places：NotionのPlaceプロパティと静的地図用の緯度・経度
- Itinerary Items：予定、移動、場所Relation、公開情報

NotionページURLとデータソースIDは公開リポジトリへコミットせず、GitHub Variablesまたはローカルの`.env`だけに設定してください。

## ローカル確認

Node.js 20以上で実行します。外部パッケージのインストールは不要です。

```powershell
npm run build:sample
npm run preview
```

実データで生成する場合は`.env.example`の値を環境変数として設定し、`npm run build`を実行します。`NOTION_TOKEN`をブラウザや生成物へ入れないでください。

## Notion APIの準備

1. NotionでInternal integrationを作成し、Read content権限を付けます。
2. `Travel Itinerary System`ページをそのIntegrationへ共有します。
3. Integration secretをGitHubの`NOTION_TOKEN` Secretへ登録します。

CodexのNotion連携とInternal integrationは別の認証です。GitHub Actionsから読むためにはInternal integrationが必要です。

## Cloudflare Workerの準備

1. Cloudflare DashboardのWorkers & PagesでWorkerを作成します。
2. Worker名を`wrangler.jsonc`の`name`と一致させます（初期値は`travel-itinerary-system`です）。
3. Workerを編集できるAPI Tokenを作成し、GitHub Secret `CLOUDFLARE_API_TOKEN`へ登録します。
4. Account IDをGitHub Secret `CLOUDFLARE_ACCOUNT_ID`へ登録します。

GitHub Actionsは`dist`をWorkerの静的アセットとしてデプロイします。現在の設定では`travel-itinerary-system.baribaritozan.workers.dev`が更新先です。

## GitHubの設定

Repository Secrets:

- `NOTION_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Repository Variables:

- `NOTION_TRIPS_DATA_SOURCE_ID`
- `NOTION_PLACES_DATA_SOURCE_ID`
- `NOTION_ITEMS_DATA_SOURCE_ID`

Actionsの`Publish itinerary`を手動実行し、`trip_slug`へTrips DBのSlugを入力します。

## 公開データのルール

- 3DBすべてで`Publish`がオンの行だけを取得します。
- Itinerary Itemsは指定TripにRelationされた行だけを出力します。
- Transit以外は公開済みPlace、Transitは公開済みFrom/Toを必須とします。
- 不足があればデプロイを失敗させ、誤った旅程を公開しません。
- 予約番号や個人情報は`Public Notes`に記載しないでください。

Cloudflare Workerの公開URLをNotionへ`/embed`で一度貼れば、以後は同じURLの再デプロイだけで表示が更新されます。
