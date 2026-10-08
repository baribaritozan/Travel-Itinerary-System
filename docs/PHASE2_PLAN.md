# Phase 2 実装計画

正式要求: SPECIFICATION.md v0.3。開始: 2026-10-08 23:09 JST。

## Git baseline

- 開始branch: main、HEAD: `213a1780a2860ffbd472d2621086ceb3518add0b`、既定branch: origin/main。
- 既存変更: SPECIFICATION.md v0.3とdocs/PHASE2_GOAL_PROMPT.mdのみ。内容確認済み、秘密情報なし。このタスクの要求資料として専用branchに保存。
- branch: `codex/phase2-20261008-230918`。
- snapshot SHA: `6f927e04a5a9ea07fba3c21fda44fbc597b64121`。
- annotated tag: `phase2-baseline-20261008-230918`。branch/tagともoriginへpush、ls-remoteで確認済み。
- origin: https://github.com/baribaritozan/Travel-Itinerary-System.git
- baseline: npm test 25/25、npm run test:browser 13/13、build成功、fail/skip 0。Node実体 v24.21.0、OS設定変更なし。artifacts/phase2-baseline-unit.txt、phase2-baseline-browser.txt（Git対象外）。

## Notion sanitized baseline（追加変更前）

接続されたTravel Itinerary System配下のItinerary Itemsを一意に確認。公開行3件、非公開行0件。新規DBは不要。

| プロパティ | 型 / option / Relation方向 |
| --- | --- |
| Item | Title |
| Trip | Relation → Trips |
| Place / From / To | Relation → Places |
| Period | Date |
| Type | Select: Activity, Transit, Meal, Stay, Note |
| Status | Select: Candidate, Booked, Confirmed, Cancelled |
| Transport | Select: Walk, Train, Bus, Car, Flight, Other |
| Reservation Status | Status: Required, Not Required, Pending, Booked |
| Currency | Select: USD, JPY |
| Order / Duration Minutes / Total Cost / Per Person Cost | Number |
| Navigation URL / Reservation URL | URL |
| Public Notes | Text |
| Publish | Checkbox |
| Last edited | Last edited time |
| Structure / Parent | 存在しない。Structure Select（Item, Alternative Group, Series）とParent一方向自己Relationを追加予定 |

既存option/プロパティ/行は変更しない。未設定StructureをItemとして解釈。検証用サンプルは新規行のみで構成し、最終Publish=falseにする。

## 本番baseline

Worker: travel-itinerary、URL: https://travel-itinerary.baribaritozan.workers.dev 。直前version: `65cfdd10-68ee-44c1-a49a-141612930f87`（2026-10-08 22:18 JST）。wrangler deployments listで確認。smoke証拠はPHASE2_REPORTに記録する。

## 設計と対応表

Notion境界はscripts/notion.mjs。同期は公開行のみ取得し、旅行ごとの全ノードを検証してから既存SHA-256公開IDへ変換。APIの配列はフラット。旧キャッシュは読取互換を保持。ブラウザのツリー・フィルター・選択・地図対象計算はpublic/model.mjs、操作はapp.js、表現はstyles.css。APIの書込み境界・DOクールダウン・Webhook署名は維持する。

| 要件 / Phase 2基準 | 実装 | 自動テスト / ブラウザ証拠 |
| --- | --- | --- |
| FR-13、基準6〜8 | selectedIds、全公開Item子孫から三状態、prune、解除 | phase2-model、browser親子選択/日付/再取得 |
| FR-14、基準3〜4 | Alternative Group、Status/Order候補順、activeCandidateByGroup、carousel | phase2-model、browser mobile/desktop・スワイプ/矢印/Enter/Space |
| FR-15、基準5 | Series概要、詳細内の子タイムライン、独立展開/フォーカス | phase2-model、browser系列内操作 |
| FR-16、基準9〜10 | 分類内OR/分類間AND、祖先保持、Cancelled、予約ショートカット、隠れた選択件数 | phase2-model、browser filters |
| FR-17、基準11〜12 | 初期範囲、15分、半開区間、終日/終了なし、境界停止、地図限定 | phase2-model、browser time/map |
| FR-12、基準1〜2 | Structure/Parentグラフ検証、期間包含、parentId公開変換 | phase2-sync: 全許可階層、循環/複数親/旅行不一致/非公開/孤立/禁止/空/期間/ID |
| 基準12 | フォーカス/選択地図強調、候補/系列の地図情報とfallback、地点集約 | phase2-model、browser pins/routes |
| 基準13〜14 | native操作44px、mixed、live region、Safe Area、motion、横溢れ防止 | browser 390×844/1440×900/200%文字、実画像確認 |
| 基準15、Phase 1 FR-01〜11/基準1〜10 | 既存状態/境界/テストを維持 | 既存25単体・統合/13ブラウザを変更・削除・skip・弱体化せず再実行 |

各実装単位で関連テスト→checkpoint commit/push。全検証と画像確認成功後のcommitのみ既存wrangler設定でデプロイ。実Notion sample一時公開→本番smoke→全sample非公開→再取得・API/画面から消滅確認。最終報告には全コマンド、証拠、変更履歴、version/commit/PR、復旧手順を記載する。
