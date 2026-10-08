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

既存環境へのPhase 1適用、Notionの列・ビュー・更新ボタン、Webhook初回設定は [デプロイ・Notion設定手順](./docs/DEPLOYMENT.md) を参照してください。

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

## Phase 1 の操作・ローカル検証

正式仕様は [SPECIFICATION.md](./SPECIFICATION.md)。要件と検証の対応は [作業計画](./docs/PHASE1_PLAN.md)、実施結果は [検証報告](./docs/PHASE1_REPORT.md) を参照してください。

- 日付・時刻・初期日付は旅行のタイムゾーン基準。予定のない日も旅行期間内の日付から確認できます。
- カード本体またはタイムラインノードで単一フォーカス。詳細ボタンで項目ごとに開閉し、「すべて閉じる」で閉じます。詳細は日付切替・フォーカス変更でも保持します。
- 地図の共有地点は1ピンにまとめ、ポップアップで予定を選びます。移動の破線は概略線であり、道路・鉄道の実経路ではありません。
- 日付切替と「全体を表示」だけで地図全体を調整します。フォーカス変更は必要なパンだけを行い、縮尺を維持します。
- スマートフォンの地図は最小・標準・拡大。拡大からは標準ボタンまたはEscapeで戻れます。文字拡大や低い表示領域では標準表示を自動的に最小相当へ調整します。
- 日付は矢印/Home/End、各ボタンはTab/Enter/Spaceで操作可能。地図・外部リンクにアクセスするためにホバーや長押しは不要です。
- 再取得失敗や古いキャッシュは警告を表示し、既存の旅程を維持します。地図が読み込めないときも詳細の外部地図リンクを利用できます。

任意の公開フィールド（存在しない場合は非表示。DBの変更は行いません）:

| Notion プロパティ | 型 | 用途 |
| --- | --- | --- |
| Reservation Status | Select / Status | 予約状態 |
| Duration Minutes | Number | 終了日時がない場合の所要分数 |
| Total Cost / Per Person Cost | Number | 全体 / 1人あたりの費用（0も表示） |
| Currency | Select | 通貨。未指定時は「通貨未指定」と表示 |

Notionの内部IDは同期境界内で使用し、公開APIでは旅行Slugを含むSHA-256で変換した安定したIDを使用します。旧キャッシュも応答時に変換します。既存の公開DBだけを取得し、予約番号等のプロパティは取得結果から公開形式へ転記しません。

```powershell
npm ci
npm test
npm run build
npm run test:browser
git diff --check
```

ブラウザテストはWindowsでインストール済みChromeを使用します。Edgeの場合は `$env:BROWSER_CHANNEL = 'msedge'` を指定します。他のOSでは `npx playwright install chromium` でブラウザを用意してください。テストはローカルfixtureと実Leaflet 1.9.4を使い、Notion/Cloudflareや外部リンク先へアクセスしません。画像は `artifacts/` に保存し、Git対象外です。失敗注入のネットワークエラーは期待値として区別し、通常シナリオのコンソールエラーは失敗扱いにします。

Volta shimが `Could not determine Volta install directory` で失敗する環境では、インストール済みNode.js 24以上を直接指定できます。OS設定の変更は不要です。今回の検証では次を使用しました。

```powershell
$node24 = Join-Path $env:LOCALAPPDATA 'Volta\tools\image\node\24.21.0\node.exe'
& $node24 --version
& $node24 --test
& $node24 scripts/build.mjs
& $node24 --test scripts/browser-check.mjs
```

## API エンドポイント

- `GET /api/itinerary`：現在のキャッシュを返し、未取得ならNotionから取得
- `POST /api/refresh`：Notionから再取得。ブラウザのキー入力は不要
- `POST /api/notion-webhook`：Notion Connection Webhook専用

公開更新APIは固定された旅行の読み取りだけを行い、書き込みや任意API呼び出しはできません。Origin確認とDurable Objectの60秒クールダウンで誤操作・連打を抑えます。
