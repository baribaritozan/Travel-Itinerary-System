# Phase 1 作業計画・変更前ベースライン

正式な要求仕様は `SPECIFICATION.md`。Phase 2/3、デプロイ、Notion更新、OS設定変更は対象外。

## 調査結果（実装前）

- 構成: public の静的UI、Notion変換、Worker、旅行別Durable Object。依存パッケージなし。
- 既存UI: 日付文字列の先頭とUTCの今日を使用。カード内の詳細を常時表示。フォーカス時にfitBounds/setViewを実行。移動線を操作できない。詳細・パネル状態・安定した自動フォーカスなし。
- キャッシュ: Workerはstale/throttledヘッダーを返すがUIは無視。再描画時に地図を破棄せず作り直す。
- Notion変換: 日時の文字列順。予約状態・費用・所要時間の公開フィールドは未対応。内部IDをそのまま公開。
- 既存テスト9件: Notion変換、固定旅行、Origin制限、Webhook HMAC、クールダウン。
- `node --version` / `npm --version` / `volta --version`: `Could not determine Volta install directory`、終了コード1。
- 既存の `C:\Users\wyuya\AppData\Local\Volta\tools\image\node\24.21.0\node.exe` を直接実行: v24.21.0。OS/Volta設定を変更しない。
- 同Nodeの `--test`: 9/9成功、skip 0。`scripts/build.mjs`: 成功。SPECIFICATION.mdは開始時点で未追跡。内容は変更しない。

## 実装・検証対応（実装前に確定）

| 要件 | 差分・実装箇所 | 自動テスト / 明示的検証 |
| --- | --- | --- |
| FR-01 / 受入3 | model.mjsの日付、今日、期間、時刻、notion.mjsの日時検証 | ui-model: Tokyo/LA/UTC/極端な時差、日付のみ、初期日の直近判定。browser:端末LA・旅行Tokyo |
| FR-02 | 開始瞬間→表示順→名称、タイムライン・ノード・実線/破線 | ui-model:異なるoffsetと同時刻。browser:順序・日付切替・ノードのラベル |
| FR-03 | 概要/詳細、場所/公開メモ/予約/費用/施設リンク、すべて閉じる | browser:詳細ボタン・内容・複数開閉・リンク |
| FR-04 | 日付状態、日付別レイヤー、日付切替時のみ全体調整 | browser:日付とカード/ピン更新、空の日の導線 |
| FR-05 / 受入4,5 | 単一フォーカスと更新元、カード/ノード/ピン/移動線、停止後スポット判定 | browser:双方向・線と共有ピンの選択、スポットへスクロール、停止後1回、手動地図後fitBounds不発 |
| FR-06 | 地点ピン集約、移動は破線の概略線、名称/時刻ポップアップ | browser:共有地点・概略線ラベル・キーボードで移動線操作 |
| FR-07 / 受入1,2 | モバイル3段階、PC左旅程/右地図、独立スクロール | browser:390×844/1440×900寸法・横溢れ・パネル操作・スクリーンショット |
| FR-08 / 受入9 | 同期状態、stale警告、60秒クールダウン、データ維持 | worker追加:stale/初回失敗/同時更新。browser:失敗・stale・throttled・成功/状態維持 |
| FR-09 / 受入10 | 非同期地図読込・失敗/タイル失敗、旅程/外部リンク維持 | browser:Leaflet遮断・初回API失敗再試行・地図なしのリンク |
| FR-10 / 受入6 | focusedItemIdとexpandedItemIdsを独立保持 | browser:展開後別項目をフォーカス、日付/同期後も保持 |
| FR-11 / 受入7,8 | native button、日付矢印、44px、focus-visible、リンク独立 | browser:キーボードのみの日付/カード/詳細/リンク/地図、主要要素の寸法、タッチ入力 |
| Phase1 用語・状態 | selectedDay/focusedItemId/expandedItemIds/mapPanelMode/focusSource | docsの状態定義、browserの利用者操作で検証 |
| Phase1 自動フォーカス | 表示領域mobile35%/PC50%、スクロール停止後、循環抑止 | browser:scroll停止・展開でサイズが変わってもフォーカス独立 |
| 基本アクセシビリティ | Safe Area、低モーション、読み上げ、AA配色、200% | browser:reduced-motion/200%文字とレイアウト/キーボード/44px、配色比の計算 |
| セキュリティ境界・回帰 | 公開フィールドのみ、URL許可、文字/属性エスケープ、公開用ID | 既存9件維持。追加Notion検証/ページング/Publish/URL/ID、Worker固定旅行/署名/キャッシュ、browser:悪意ある文字列 |

## 順序

1. 上記ベースライン取得（完了）。
2. 日時/URL共通処理とNotion公開形式の必要最小限の改善、単体・統合テスト。
3. 独立UI状態、カード/タイムライン、地図同期、パネル/アクセシビリティ/失敗表示。
4. ローカルfixture/APIのブラウザハーネス（外部更新なし）、実Leafletと遮断環境で自動テスト。
5. 全テスト・ビルド・全JS構文・diff検査、両画面の画像確認、結果をPHASE1_REPORT.mdへ記録。

ブラウザテストはテスト専用fixtureとローカルHTTPのみ使用。実Notion/Cloudflareへ接続しない。実LeafletでDOM操作を検証し、fitBounds回数は既存APIを観測して判定する。
