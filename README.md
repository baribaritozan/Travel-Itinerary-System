# Notion Itinerary System

Notionを旅程の正本にし、Cloudflare Workerでスマホ向けの旅程・地図を表示します。GitHubはソース管理だけに使い、旅程の更新にGitHub Actionsや再デプロイは使いません。

## 構成

- 静的UI：Worker Static Assets
- データ取得：WorkerからNotion API
- キャッシュと連打防止：Durable Object（旅行ごとに1個、更新は60秒に1回まで）
- サイトから更新：`POST /api/refresh`
- Notionから更新：Publish Requests DBへのページ追加 → Notion Connection Webhook
- 秘密情報：すべてCloudflare Worker Secrets。ブラウザとGitHubには含めません。

## Notionデータベース

- Trips：旅行単位の期間、タイムゾーン、公開Slug
- Places：地図に表示する場所と緯度・経度
- Itinerary Items：予定、移動、場所Relation、公開情報
- Publish Requests：Notionからの更新要求と処理結果

Trips・Places・Itinerary Itemsは`Publish`がオンの行だけを公開します。予約番号、パスポート情報、決済情報などは`Public Notes`へ入力しないでください。

## Workerの設定

Internal integrationには、4DBへのRead content権限と、Publish Requests DBへのUpdate content権限が必要です。`Travel Itinerary System`ページをIntegrationへ共有してください。

次をCloudflare Dashboardの `travel-itinerary` → Settings → Variables and Secrets に暗号化Secretとして設定します。

- `NOTION_TOKEN`
- `NOTION_TRIPS_DATA_SOURCE_ID`
- `NOTION_PLACES_DATA_SOURCE_ID`
- `NOTION_ITEMS_DATA_SOURCE_ID`
- `NOTION_PUBLISH_REQUESTS_DATA_SOURCE_ID`

`DEFAULT_TRIP_SLUG`は[wrangler.jsonc](./wrangler.jsonc)にあり、現在は`sample-trip`です。コードを更新するときだけ手元からデプロイします。

```powershell
npm test
npm run build
npx wrangler deploy
```

初回アクセスではWorkerがNotionから取得してDurable Objectへ保存します。その後はサイトの「Notionから再取得」で即時更新できます。同じ旅行への再取得は60秒間キャッシュされます。

## Notionの更新ボタン

無料プランではボタンの「Webhookを送信」は使わず、「ページを追加」を使います。

1. `Travel Itinerary System`ページで `/button` を追加します。
2. ボタン名を「旅程サイトを更新」にします。
3. アクションに `ページを追加` を指定し、追加先を `Publish Requests` にします。
4. `Request`を「旅程サイトを更新」、`Trip`を対象旅行、`Status`を`Queued`に設定します。

## Connection Webhook

1. NotionのIntegration設定 → Webhooksで、新しいSubscriptionを作成します。
2. URLを `https://travel-itinerary.baribaritozan.workers.dev/api/notion-webhook` にします。
3. Event typeは`page.created`を選びます。
4. Cloudflareのリアルタイムログに出るverification tokenをNotionの確認欄へ貼り付けます。
5. 同じtokenをWorker Secret `NOTION_WEBHOOK_VERIFICATION_TOKEN`へ設定します。

Webhookは署名を検証し、作成されたページがPublish Requests DB所属の場合だけ再取得します。処理後はその行を`Published`または`Error`へ更新します。Notionのイベント配信は即時とは限らず、通常は1分以内、場合によっては数分かかります。

## ローカル確認

Node.js 24以上を使用します。静的UIだけなら次で確認できますが、APIを含める場合はWranglerを使います。

```powershell
npm run build
npx wrangler dev
```

`.env`、`.dev.vars`、`dist`はGitへコミットしません。NotionページURLやData Source IDも公開リポジトリへ記載しないでください。

## API

- `GET /api/itinerary`：現在のキャッシュを返し、未取得ならNotionから取得
- `POST /api/refresh`：Notionから再取得。ブラウザのキー入力は不要
- `POST /api/notion-webhook`：Notion Connection Webhook専用

公開更新APIは固定された旅行の読み取りだけを行い、書き込みや任意API呼び出しはできません。Origin確認とDurable Objectの60秒クールダウンで誤操作・連打を抑えます。
