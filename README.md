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

## Phase 2 の比較・計画

Itinerary Itemsの同じDBに次の2プロパティを追加します。グループ用DB、新しいSecret、Data Sourceは不要です。

| プロパティ | 型 / 正規値 |
| --- | --- |
| Structure | Select: `Item`, `Alternative Group`, `Series` |
| Parent | 同じItinerary Itemsへの一方向Relation、0または1件 |

既存行はStructure未設定のまま `Item` として利用できます。一括更新は不要です。通常項目のルート、候補グループ→Item/Series、Series→Itemを許可します。公開グループは公開直接候補2件以上、公開系列は公開直接Item1件以上が必要です。子の親もPublishをオンにします。循環、複数親、旅行不一致、非公開/不存在の親、禁止ネスト、空コンテナは同期エラーとなり、既存キャッシュを維持します。

コンテナのPeriod未設定時は公開子の期間から算出します。設定時は全子の期間を包含してください。親の費用・状態・場所などは子へ継承しません。APIは `structure` / 公開用 `parentId` を持つフラット配列です。

- 候補はスマートフォン1件、PC2〜3件。スワイプ、前後ボタン、候補表示ボタン、候補領域の左右矢印/Home/Endで切り替えます。系列は詳細内に子タイムラインを持ち、子も個別フォーカス・詳細展開できます。
- 「選択する」はフォーカスと独立した複数選択。親は全公開子孫から未選択/一部/全選択を表示し、一部の親操作は全選択、全選択の操作は全解除です。日付・フィルターで保持し、再取得で削除されたIDだけを除外します。Notionには保存しません。
- 「予定を絞り込む」は分類内OR・分類間AND。予約未完了はRequired/Pending、中止は明示操作まで非表示。祖先を保ち、非表示の選択件数を表示します。「選択をすべて解除」「フィルターを全解除」は別操作です。
- 「地図の時間範囲」は15分刻みの開始/終了スライダー。前後は幅を維持して日付境界で停止します。地図だけを変更し、タイムライン・選択・フォーカスは保持します。候補グループの地図はアクティブ候補、系列は表示中の子を使い、子に地図情報がない場合だけ親の場所を利用します。

詳細な自己Relationの設定は [デプロイ手順](./docs/DEPLOYMENT.md)、要件対応は [Phase 2計画](./docs/PHASE2_PLAN.md)、実環境変更と証拠は [Phase 2報告](./docs/PHASE2_REPORT.md) を参照してください。

## Phase 3 の当日運用

同じItinerary Itemsに以下を追加します。既存の列・option・行はそのまま使用します。

| プロパティ | 型 / 正規値 |
| --- | --- |
| Structure | 既存Selectへ `Flexible Block` を追加（Item / Alternative Group / Seriesも保持） |
| Opening Hours | Rich Text。公開用の営業時間。自動的な営業判定はしません |
| Detour For | 同じItinerary Itemsへの一方向Relation、0または1件 |
| Additional Duration Minutes | Number、0以上。寄り道ルートで必須 |
| Rejoin Place | Placesへの一方向Relation、0または1件。省略時は対象TransitのTo |

自由時間は `Structure=Flexible Block` と開始・終了を持つ時間枠です。直接の子はItemだけで、Periodは空にできます。候補は時刻へ自動配置せず、Order、計画状態、名称の順に一覧表示します。場所・目安所要時間・費用・予約状態・営業時間は各子へ入力してください。親フォーカスは全候補、子フォーカスはその候補の地図を強調します。地図時間範囲は子の登録時刻にかかわらず親Periodで判定します。選択、三状態、フィルターも利用できます。

主階層はAlternative Group→Item/Series/Flexible Block、Series→Item/Flexible Block、Flexible Block→Item。最大はAlternative Group→Series→Flexible Block→Itemです。通常ItemのPeriod必須と既存の代表期間算出・包含検証は維持します。

寄り道はParentではなく、ルートの `Detour For` に同じ旅行の公開 `Item` / `Transit` を1件指定します。ルートはItem、Series、Alternative Groupを使用でき、Additional Duration Minutesが必須です。子孫のDetour Forと寄り道内Flexible Blockは禁止です。時刻未定の末端ItemにはDuration Minutesを入力します。寄り道は対象Transitの詳細内に表示し、寄り道自身を展開・フォーカス・選択したときだけ地図に出ます。追加時間と次の固定予定から余裕/超過/判定不可を表示します。これは登録値による目安で、交通状況・営業時間・待ち時間の保証ではありません。

「現在地と外部経路」を開き、「現在地を表示/更新」を操作すると一回だけ取得します。初期表示・日付・カード操作では権限を要求しません。座標・精度・時刻はブラウザのメモリ内だけで保持し、サーバー/Notion/ログ/永続ストレージへ保存・送信しません。再読み込みで破棄し、5分を超えると更新を案内します。◎マーカーと精度円は旅程のフォーカス・選択対象外です。取得エラー時も旅程は使えます。

詳細の「現在地からの経路を開く」は、第三者のGoogle Mapsへ現在地と目的地を送る明示操作です。HTTPS Directions URLを新しいタブでnoopener付きで開きます。目的地は通常Item/自由時間候補のPlace、TransitのTo、系列のフォーカス中の子または最初の有効な子、候補グループのアクティブ候補です。座標を優先し、なければ公開住所を使用します。Walk=walking、Train/Bus=transit、Car=driving、Ferry/未設定はtravelmode省略。現在地が未取得・古い場合や目的地が未設定の場合は理由を表示して無効化します。アプリ内の経路検索API・位置追跡・位置履歴はありません。

Phase 3の要件対応・baselineは [計画](./docs/PHASE3_PLAN.md)、実環境の変更・検証・復旧は [報告](./docs/PHASE3_REPORT.md) を参照してください。
# Phase 4：端末保存とPWA

「端末保存とホーム画面」→「この端末に保存」で公開旅程と起動用ファイルを保存できます。圏外で旅程・地点・概略線を参照でき、背景地図には通信が必要です。ホーム画面へのインストールと旅程保存は別操作です。初回保存から30日、同じNotion同期版の再取得では延長せず、新しい正常同期版で置換して期限を更新します。ブラウザが保存領域を削除した場合は再保存が必要です。

現在地は従来どおり明示取得・メモリ限定です。登録済みFrom→Toを開く「Google Mapsで予定区間を開く」は現在地を要求しません。外部サービスには通信が必要です。「保存を解除して削除」で本アプリの旅程・設定・起動用cache・Service Workerを削除できます。公開取り下げを圏外端末へ即時反映することはできません。

`npm run test:pwa`は実Service Worker・永続Chrome profileで終了後の圏外起動、期限、削除、更新、復旧を確認します。`npm run build:recovery`は既存Worker用の復旧assets/configをartifactsへ作成します。iPhone/Android実機確認は後続です。詳細は[Phase 4計画](docs/PHASE4_PLAN.md)と[デプロイ手順](docs/DEPLOYMENT.md)を参照してください。
