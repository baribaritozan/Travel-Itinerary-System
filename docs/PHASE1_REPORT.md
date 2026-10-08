# Phase 1 実装・検証報告

実施日: 2026-10-08（Asia/Tokyo）。正式な要求仕様: `SPECIFICATION.md`。

Phase 1、FR-01〜FR-11、受け入れ基準1〜10を実装し、以下の自動検証と画像確認を完了した。既存9テストは変更・削除・skipせず維持。必須の検証に未達項目なし。

## 実装結果

- UI状態を日付 `selectedDay`、単一フォーカス `focusedItemId`、項目別詳細 `expandedItemIds`、地図パネル `mapPanelMode`、更新元 `focusSource` に分離。Phase 2の複数選択は導入していない。
- 旅行タイムゾーンによる日付・時刻・今日・最寄りの日付判定。旅行期間内の空の日も表示。日時は開始瞬間→表示順→名称で整列。日付だけの値は暦日として保持し、極端な時差でもラベルをずらさない。
- 概要に時刻/終了/所要時間、種別、計画・予約状態、移動手段、登録された費用。詳細に公開メモ、場所/出発/到着、住所/電話/Web、費用、予約・外部地図リンク。詳細開閉・リンク操作はフォーカスを変更しない。日付切替・再取得でも項目別の展開を維持。
- タイムライン、地点/活動ノード、地点間の実線/同じ地点の破線、停止後160msのスポット判定。スマートフォン35%、PC50%のスポットに地図から対象カードを移動。連続スクロール中は地図を移動しない。
- 双方向のフォーカス強調。同じ場所は1ピンと予定一覧。移動線もタッチ/キーボード操作可能。名称・時刻のポップアップ、概略線の明示。フォーカス変更は必要なパンのみで縮尺を維持。全体調整は日付切替と全体表示。最小パネル中の日付切替では、地図復帰後に範囲を調整。
- モバイルは地図上/旅程下、標準36dvh、最小、画面全体の拡大。PCは440pxの旅程左/地図右。旅程を独立スクロール。文字拡大・低い表示領域では地図を自動最小表示し、拡大ボタンで利用可能。
- native button、Enter/Space、日付の矢印/Home/End、明瞭なフォーカスリング、主要44×44 CSS px、ノードの画面端でのタップ領域欠けを防止。Safe Area、reduced-motion、同期/地図状態のlive region、本文配色のAAコントラスト。
- 読込、初回取得失敗と再試行、空状態、位置情報不足、更新中・成功・失敗・stale・throttled、60秒クールダウン、Leaflet/背景タイル失敗を通知。遅い更新中も再取得ボタンを無効にし、キャッシュの旅程を維持。
- Notionの公開フィールドだけを変換。不正日時・タイムゾーン・座標・非公開Relationは同期全体を失敗。Notion内部IDは同期境界内に限定し、公開IDは旅行Slugを含むSHA-256で安定化。旧キャッシュは保存内容を変えず、応答時にIDとURLを保護。HTTPS/電話URLを制限し、文字列/属性をエスケープ。

## 要件と検証結果

単体・統合テスト: `tests/notion.test.mjs`、`tests/worker.test.mjs`、`tests/ui-model.test.mjs`、`tests/sync.test.mjs`。
ブラウザテスト: `scripts/browser-check.mjs`。実Leaflet 1.9.4、ローカルAPI/公開旅程fixture、テスト用背景タイルを使用する。

| 要件 | 実装箇所 | 検証証拠 | 結果 |
| --- | --- | --- | --- |
| FR-01 | model.mjs / notion.mjs | 端末LA・旅行TokyoでUTC日付をまたぐ00:30、今日/最寄り日、UTC+14/-12、Notion wall time/DST、Publish=true | 成功 |
| FR-02 | compareItems / renderItems | 異なるoffsetの同時刻→Order→名称、ブラウザの表示順、地点/活動ラベル、実線/破線の判定 | 成功 |
| FR-03 | details / setExpanded | 概要/詳細、公開メモ・住所・電話・費用・予約/外部リンク、すべて閉じる | 成功 |
| FR-04 | selectDay / renderMap / fitDay | 翌日と空の日でカード・ピンを同時更新、最小中の日付切替から復帰 | 成功 |
| FR-05 | focusItem / paintFocus / popupFor | カード→対象ピンのみ、ピン/共有ピン一覧/移動線→単一カード、PC50%/mobile35%、scroll停止・最大1回pan、手動zoom後fit不発 | 成功 |
| FR-06 | renderMap / 地図凡例 | 地点ピン集約、移動線、概略線文言・ポップアップ | 成功 |
| FR-07 | styles.css / setMapMode | 390×844地図36dvh/旅程下、最小/標準/拡大、1440×900旅程左440px/地図右、横溢れなし | 成功 |
| FR-08 | refresh / applySyncHeader / ItineraryState | HTTP失敗、stale、throttled、成功、60秒解除、遅い応答の二重更新防止、DOキャッシュ保持/同時更新共有 | 成功 |
| FR-09 | loadMap / details | Leaflet遮断時もカード操作・外部地図リンクの別タブ表示、タイル失敗通知 | 成功 |
| FR-10 | 独立state | 詳細開閉でフォーカス不変、他カードをフォーカスしても展開維持、日付/再取得後も維持 | 成功 |
| FR-11 | native controls / Leaflet補助 | キーボードのみの日付/カード/詳細/リンク/ノード/ピン/移動線、タッチ操作、44pxと画面端の有効領域 | 成功 |

| 受け入れ基準 | 証拠 | 結果 |
| --- | --- | --- |
| 1 | mobile 390×844、地図36dvhと旅程を同時表示、主要操作、document/panelの横溢れ検査・画像確認 | 成功 |
| 2 | desktop 1440×900、左旅程440px/右地図、独立スクロールと地図操作・画像確認 | 成功 |
| 3 | 端末America/Los_Angeles・旅行Asia/Tokyo、初期10/9、00:30–01:00、暦日ラベル単体検証 | 成功 |
| 4 | カードフォーカス時に対象地点/移動線だけ強調、共有地点の集約、単一カードのaria-pressed | 成功 |
| 5 | ピン/移動線操作からカードが見えるスポットへ移動、desktop50%/mobile35% | 成功 |
| 6 | 展開したカードから別カードへフォーカスしてもaria-expandedと詳細内容を維持 | 成功 |
| 7 | マウスなしで日付→Tab→概要Space→詳細Enter→リンクEnter、外部リンクはnoopener、ノード/地図Space | 成功 |
| 8 | ボタン・カード・ノード・ピン・リンク・ズームの44px測定、タッチとキーボード代替操作 | 成功 |
| 9 | Notion失敗時のDOキャッシュ保護、UIのHTTP失敗/stale警告とカード/展開/フォーカス継続 | 成功 |
| 10 | Leaflet script遮断、旅程/詳細利用、Google Mapsリンクを実際に別タブで開く（遷移先はfixture） | 成功 |

追加検証: 悪意あるHTML・属性・javascript URL、背景タイル失敗、初回失敗再試行、本文配色AA、200%文字と720×450のズーム相当表示、reduced-motionでanimate:trueなし。通常シナリオはコンソールエラー/uncaught errorなし。失敗注入時のブラウザ自身のネットワークエラーだけを期待値として区別し、アプリ例外は一切許容していない。

## コマンドと結果

Node.js v24.21.0、npm 11.19.0、Chrome 154.0.8037.98（Windows）。OSやVolta設定は変更していない。各コマンドはリポジトリ直下で実行。

| コマンド | 結果 |
| --- | --- |
| 変更前 `node --version` / `npm --version` / `volta --version` | 終了1、`Could not determine Volta install directory` |
| 既存Node実体の `--version` | v24.21.0、要件>=24を満たす |
| 変更前 同Node `--test` / `scripts/build.mjs` | 9/9、skip0、ビルド成功 |
| `npm install --save-dev --save-exact playwright@1.62.1 leaflet@1.9.4 --fetch-retries=0 --fetch-timeout=20000`（Node/npm実体を使用） | ローカル開発依存取得、audit 0 vulnerabilities、lockfile作成 |
| 最終 `npm test`（Node/npm実体と子プロセスPATH指定） | 25/25、fail0、skip0 |
| 最終 `npm run test:browser`（同上） | 内部のbuild成功、13/13、fail0、skip0 |
| `node --check`（rgで列挙した全JS/MJS） | 10/10成功 |
| `git diff --check` | 終了0。GitのCRLF変換予定の通知のみ |

実体の指定方法:

```powershell
$phaseNode = 'C:\Users\wyuya\AppData\Local\Volta\tools\image\node\24.21.0\node.exe'
$phaseNpm = 'C:\Users\wyuya\AppData\Local\Volta\tools\image\node\24.21.0\node_modules\npm\bin\npm-cli.js'
$env:Path = (Split-Path $phaseNode) + ';' + $env:Path
& $phaseNode $phaseNpm test
& $phaseNode $phaseNpm run test:browser
rg --files -g '*.js' -g '*.mjs' | ForEach-Object { & $phaseNode --check $_ }
git diff --check
```

ローカル証拠（Git対象外）: `artifacts/unit-results.txt`、`artifacts/browser-results.txt`、`artifacts/mobile-390x844.png`、`artifacts/desktop-1440x900.png`、`artifacts/mobile-text-200-percent.png`。3枚とも実際に開き、配置・文字・操作領域を目視確認した。

途中の失敗と解消:

- サンドボックス内ではunpkgのDNS解決不可、ローカルHTTPへ `ERR_NETWORK_ACCESS_DENIED`。依存取得とブラウザ検証を許可された実行環境で実施。OS/ブラウザのセキュリティ設定を変更していない。
- 初回ブラウザテスト7/10成功。Leaflet末尾のsource-mapコメントに観測コードが吸収され、`__mapCalls is not defined`。改行を追加して観測コードを修正。再試行テストの時計未設定により空の日を初期選択していたため、他のテストと同じ時計を明示。アプリ要件や既存テストの期待値を緩和せず、10/10、その後の追加を含め最終13/13を確認。
- 追加確認でタイムライン移動線の判定、200%文字での地図最小化、ノードの画面端のタップ領域、最小パネル中の日付切替を改善し、全テストを再実行した。

## 変更ファイル

| ファイル | 変更 |
| --- | --- |
| public/model.mjs（新規） | 日付/時刻/並び/URL/エスケープ/スポットの共通処理 |
| public/app.js | 独立UI状態、カード、タイムライン、地図同期、同期/失敗表示 |
| public/styles.css | レイアウト、パネル、44px、フォーカス、Safe Area、AA配色、低モーション |
| public/index.html | module起動、地図の非同期化、loadingとnoscript |
| scripts/notion.mjs | 日時/座標検証、任意公開フィールド、公開ID/URL |
| src/worker.mjs | 旧キャッシュ応答の公開ID/URL保護。API/DO/署名方式は維持 |
| tests/ui-model.test.mjs（新規） | 日時/並び/エスケープ/リンク/スポット/配色 |
| tests/sync.test.mjs（新規） | Notion公開変換/ページング/検証/DO/署名付きWebhook/旧キャッシュ |
| scripts/browser-check.mjs（新規） | 13シナリオのブラウザ操作、寸法/エラー検査、画像保存 |
| package.json / package-lock.json（新規） | test:browser、固定バージョンの開発依存。通常のnpm testを維持 |
| .gitignore | ローカル証拠artifactsを除外 |
| README.md | 操作、任意フィールド、再実行、Volta回避方法 |
| docs/PHASE1_PLAN.md / PHASE1_REPORT.md（新規） | 実装前対応表・ベースライン、最終証拠 |

開始時点で未追跡のSPECIFICATION.mdは編集していない。既存notion.test.mjs/worker.test.mjsは変更していない。コミット・デプロイ・Notion DB変更/更新・秘密情報追加は行っていない。

検証の範囲: 必須のモバイル相当/PC相当ブラウザ確認はChromeで実施。実機iOS/Safari、本番Cloudflare/Notion、外部タイルの稼働保証はこのローカル実装検証に含めない。外部サービスのライブ接続を要求せず、その成功/失敗契約をfixture・Worker/Notion統合テストで確認した。
