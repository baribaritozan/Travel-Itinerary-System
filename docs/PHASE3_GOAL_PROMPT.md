# Phase 3 Goal プロンプト

このプロンプトは `SPECIFICATION.md` v0.4 の Phase 3 を、完了済みの Phase 1・2 を回帰させずに実装・検証するためのものです。Codex Goal の成果、検証手段、制約、作業範囲、反復方針、ブロック時の停止条件を明示しています。

GitHub更新、既存Cloudflare Workerへのデプロイ、Notionへの追加的なスキーマ・サンプル操作、実環境検証を許可します。ただし、実装前の状態へ復旧できるGit基準点を外部変更前に確保し、Notionの既存データ・既存プロパティには非破壊制約を適用します。

以下を対象リポジトリを開いた Codex のチャットで使用してください。

```text
/goal SPECIFICATION.md v0.4を正式な要求仕様として、旅程表示WebアプリのPhase 3「柔軟な当日運用」を実装し、FR-18〜FR-21および19.3「Phase 3」の受け入れ基準1〜16を、再現可能な証拠とともに全て満たす。Phase 1・2の機能、既存テスト、公開境界、モバイル優先の操作性、Notionを正本とする構成を維持する。検証済み実装を既存Cloudflare Workerへデプロイし、本番smoke testとNotionサンプルの後片付けまで完了する。未検証事項、回帰、公開中の検証サンプル、復旧不能な外部変更が残る状態ではGoalを完了にしない。

対象リポジトリ:
C:\Users\wyuya\Desktop\work\06_progress_private_project\TravelWebApp\Projects\notion-itinerary-publisher

正式な要求仕様と基準資料:
- SPECIFICATION.md v0.4
- docs/PHASE2_REPORT.md
- docs/PHASE1_REPORT.md
- docs/DEPLOYMENT.md
- README.md
- package.json

達成する要件:
- SPECIFICATION.mdのPhase 3
- FR-18〜FR-21
- 19.3「Phase 3」の受け入れ基準1〜16
- Phase 1のFR-01〜FR-11と受け入れ基準1〜10の継続的な充足
- Phase 2のFR-12〜FR-17と受け入れ基準1〜15の継続的な充足
- Phase 2完了時点の単体・統合テスト52件、ブラウザ検証20件を削除・skip・弱体化せず維持

仕様の優先順位:
- 挙動と完了条件はSPECIFICATION.md v0.4を正本とする。
- 本プロンプトは作業境界と検証方法を補足する。仕様書と矛盾する場合は仕様書を優先し、勝手に仕様を弱めない。
- 実装上の軽微な選択は、既存設計との整合、スマートフォンでの扱いやすさ、アクセシビリティ、非破壊性の順に判断する。
- 要件を変える必要がある場合は変更せず、理由、影響、選択肢、推奨案をブロッカーとしてユーザーへ提示する。

最初に行うこと:
1. リポジトリ、仕様書、Phase 1・2報告、デプロイ手順、既存実装、既存テスト、git status、現在のbranch、HEAD、remote、既定branchを読み取り専用で調査する。
2. SPECIFICATION.mdのコミット、作業ツリーの変更、未追跡ファイルを確認し、ユーザーの変更を破棄・上書き・stashしない。
3. ソース、計画書、Notion、GitHub、Cloudflareを変更する前に、次節の方法で専用branch、baseline commit、annotated baseline tagを作成してoriginへpushする。
4. 変更前の `npm test`、`npm run test:browser`、`npm run build`、全JS/MJSの `node --check` を実行し、52件・20件を含むベースライン結果を記録する。
5. FR-18〜FR-21と受け入れ基準1〜16を、実装箇所、自動テスト、ブラウザ検証、実環境証拠へ対応付けた `docs/PHASE3_PLAN.md` を作成する。
6. 現在のNotionスキーマ、公開件数、Phase 2サンプルの最終Publish状態、本番Worker・URL・deployment/version、公開APIの件数と境界を読み取り専用で確認する。
7. npm/Volta shimが失敗する場合はOS設定を変更せず、docs/PHASE2_REPORT.mdに記載されたNode.js v24.21.0実体を優先して使用する。利用できない場合は、安全な既存Node.js 24以上を確認する。

変更前スナップショットとGit運用:
- 作業開始時の状態を正確に復元できる専用branch `codex/phase3-YYYYMMDD-HHMMSS` を作成する。
- 作業ツリーがdirtyなら、内容と機密性を確認する。本タスクの安全な仕様書・Goalプロンプト等だけであれば、専用branch上のbaseline snapshot commitへ含めてよい。不明な変更や秘密情報を含む可能性があれば勝手にcommitせず、外部変更前に停止して報告する。
- 実装前の正確なcommitへannotated tag `phase3-baseline-YYYYMMDD-HHMMSS` を作成する。
- baseline branchとtagをoriginへpushし、commit SHA、tag、branch、作成時刻をdocs/PHASE3_PLAN.mdへ記録する。push確認前にNotion変更やデプロイを開始しない。
- 実装中は、同期・検証、モデル、UI、テスト、ドキュメント等の意味のある単位でcheckpoint commitを作り、専用branchへpushする。
- force-push、rebaseによる共有履歴書き換え、remote branch/tagの削除、既存branchへの直接的な履歴書き換えを行わない。
- 秘密情報、Notion内部ID、Cloudflare token、実際の現在地、ローカル証拠画像・ログをcommitしない。
- 全検証後に最終commitをpushし、GitHub上でPhase 3のPRを作成する。PRは自動mergeしない。
- 復旧はbaseline tagから別worktreeと新規復旧branchを作る非破壊的な方法とし、既存worktreeをresetしない。手順をdocs/PHASE3_REPORT.mdへ記録する。

Notionデータ構造:
- 専用の自由時間DB、寄り道DB、グループDBを追加しない。既存のItinerary Items DBとPlaces DBを使用する。
- 既存Structure Selectへ正規値 `Flexible Block` を追加する。既存の `Item`、`Alternative Group`、`Series` と未設定をItemとして扱う後方互換性を維持する。
- Itinerary Itemsへ次のプロパティを追加する。既に同名プロパティがある場合は型と設定を検証し、適合するものを再利用して重複を作らない。
  - `Opening Hours`: Rich Text
  - `Detour For`: Itinerary Items自身への一方向Relation、0または1件
  - `Additional Duration Minutes`: Number、0以上の分数
  - `Rejoin Place`: PlacesへのRelation、0または1件
- `Parent` は主階層、`Detour For` は寄り道ルートから移動旅程への副次Relationとして責務を分ける。相互に代用しない。
- 許可する主階層は、ルートの各構造、`Alternative Group → Item / Series / Flexible Block`、`Series → Item / Flexible Block`、`Flexible Block → Item` とする。
- 最大階層は `Alternative Group → Series → Flexible Block → Item`。`Item`は子を持てない。
- 循環、複数親、旅行不一致、非公開親、孤立参照、禁止ネスト、Itemの子、空コンテナを同期エラーにする。
- 公開Alternative Groupは2件以上の公開直接候補、公開Seriesは1件以上の公開直接子、公開Flexible Blockは1件以上の公開直接Itemを必要とする。
- 通常の末端ItemはPeriod必須を維持する。Flexible Block自身のPeriodは必須、直接の子ItemはPeriod未設定を許可する。寄り道ルート内の末端ItemはPeriod未設定を許可する代わりにDuration Minutesを必須とする。
- Detour Forを設定できるのはParentを持たない寄り道ルートのルートだけとする。対象は同じ旅行の公開 `Structure=Item` かつ `Type=Transit` に限定する。
- 寄り道ルートのStructureはItem、Series、Alternative Groupを許可し、Flexible Blockは禁止する。自己参照、子孫参照、旅行不一致、Transit以外への参照、子孫へのDetour For設定を同期エラーにする。
- 寄り道ルートのルートはAdditional Duration Minutes必須、Rejoin Place任意とする。
- APIはNotion内部IDを公開せず、既存の公開用安定IDへ変換した `parentId`、`detourForId`、`rejoinPlaceId` と、`structure`、`openingHours`、`additionalDurationMinutes` を返す。
- 古いキャッシュやPhase 2形式のpayloadを安全に扱い、新規フィールドがない既存データを回帰させない。

Notion実環境の変更権限と制約:
- 接続済みの実Notionを調査し、上記のStructure optionと4プロパティを追加してよい。
- 変更前に対象DBを一意に確認し、DB名、プロパティ名、型、Select options、Relationの向き、公開対象件数を、秘密情報・内部IDを除いたsanitized baselineとしてdocs/PHASE3_PLAN.mdへ記録する。
- 既存プロパティの削除、名前変更、型変更、既存optionの削除・改名、既存Relationの解除、既存ページの削除・archive、既存値のclear、既存行の一括更新を禁止する。
- 既存行は原則read-onlyとする。検証のために既存行のStructure、Parent、Period、Publish等を変更しない。
- Phase 3検証専用のサンプル行を既存Itinerary Items DBへ追加してよい。名称に `[Phase3 Sample]` を付け、既存旅程を親・子・Detour For対象として再利用せず、新規サンプルだけで関係を完結させる。
- 最小限のサンプルで、Flexible Blockと時刻未定子候補、Transit対象、単独寄り道、Series寄り道、Alternative Group寄り道、追加所要時間、任意の復帰地点を検証する。
- 場所は既存公開Placeを読み取り参照してよい。既存Placeの変更は禁止する。どうしても不足する場合に限り、既存Places DBへ識別可能な `[Phase3 Sample]` Placeを追加してよいが、削除・archiveせず、既存データを変更しない。
- サンプルはPublish=falseで作成する。実公開テストに必要な最小時間だけ、新規Phase 3サンプルに限ってPublish=trueへ変更してよい。
- 公開テストはallowlist化した新規サンプルだけを対象にし、例外時も必ずPublish=falseへ戻す `try/finally` 相当の後片付けを実装する。
- テスト後は全Phase 3サンプルをPublish=falseへ戻し、再取得後に本番APIと公開画面から消えたことを確認する。サンプルと追加プロパティは削除・archiveしない。
- 既存公開行の変更前後ハッシュまたは同等のsanitized比較を行い、既存データが変化していないことを証明する。内部IDや秘密値を報告書・Gitへ残さない。
- Notion変更ごとに、対象プロパティまたはサンプル名称、目的、実施時刻、最終Publish状態をdocs/PHASE3_REPORT.mdへ記録する。
- 予定外に既存データ、既存プロパティ、既存optionの変更が必要になった場合は実行せず、ブロッカーとしてユーザー入力を求める。

自由時間のUIと状態:
- Flexible Blockを一つの時刻付きタイムライン項目として表示し、子候補を独立した時刻ノードへ配置しない。
- 子候補は表示順、計画状態、名称で安定して並べ、候補一覧またはチェックリストとして表示する。
- 子候補に場所、Duration Minutes、費用、Opening Hours、予約状態等の登録済み公開情報を表示する。
- Flexible Blockのフォーカスでは全候補の地図要素を強調し、子候補のフォーカスでは該当候補だけを強調する。
- Phase 2の単一フォーカス、項目別詳細展開、複数選択、親の三状態選択、フィルター、地図同期をFlexible Blockと子候補へ拡張する。
- 地図表示時間範囲ではFlexible Block自身のPeriodを使用し、時刻未定の子候補を親と同じ範囲判定に従わせる。

寄り道のUIと判定:
- 寄り道ルートはDetour For対象のTransitカード詳細内へ表示し、トップレベルのタイムラインには重複表示しない。
- Item、Series、Alternative Groupの各寄り道ルートを表示でき、候補グループでは既存のアクティブ候補・比較操作を再利用する。
- 寄り道の地点・経路は、寄り道を明示的に展開、フォーカス、または選択した場合だけ地図へ表示する。
- 追加所要時間、復帰地点、次の固定予定までの余裕を表示する。
- `余裕差分 = 次の固定予定の開始 - 対象Transitの終了 - Additional Duration Minutes` として算出する。
- 余裕差分が0以上なら「寄り道可能・N分余裕」、0未満なら「予定超過・N分」、次の固定予定がなければ「次の予定がないため判定不可」と表示する。
- 判定はフィルターによる一時的な非表示に左右されず、公開旅程の時刻から算出する。交通状況、営業時間、待ち時間を保証する表現にしない。

現在地とプライバシー:
- 初期表示、日付切替、地図表示、カード操作だけでは位置情報権限を要求しない。
- 「現在地を表示」「現在地を更新」の明示操作後にだけ `getCurrentPosition` を一回呼び、`watchPosition` は使用しない。
- 緯度、経度、精度、取得時刻はブラウザのメモリ内だけに保持する。アプリサーバー、Notion、ログ、分析、Local Storage、Session Storage、IndexedDB、Cache Storage、Service Workerへ保存・送信しない。
- ページ再読み込みで現在地を破棄する。取得から5分を超えた値は古い情報として表示し、更新を案内する。
- 現在地を専用マーカーと精度円で表示し、取得時刻と精度を表示する。旅程のフォーカス・選択対象にしない。
- 成功、権限拒否、タイムアウト、取得不能、非HTTPS、API非対応を区別し、通常の旅程・地図機能を停止しない。
- 自動テストと実環境検証では固定したテスト座標を使用し、実際の利用者の現在地をログ、スクリーンショット、報告書、Gitへ記録しない。

Google Maps外部経路:
- アプリ内に経路検索APIを追加しない。Google Maps Directions URLをHTTPSで新しいタブに開く。
- 目的地は仕様13.3に従い、通常ItemはPlace、TransitはTo、自由時間の子はPlace、寄り道ItemはPlaceまたはTo、Seriesはフォーカス中の子または最初の有効な子、Alternative Groupはアクティブ候補から解決する。
- `Walk → walking`、`Train / Bus → transit`、`Car → driving` とし、Ferryまたは未設定ではtravelmodeを省略する。
- 目的地を解決できない場合は操作を無効化し、理由を表示する。
- 現在地座標をGoogle Mapsへ渡すのは、利用者が経路操作を実行した時だけとする。操作前に第三者サービスへ現在地と目的地を送信することを明示する。
- 固定したGoogle Maps HTTPS originと許可済みパラメーターだけからURLを構築し、値をエンコードし、`noopener` を付ける。任意URL、javascript scheme、未検証の案内URLを経路送信先にしない。
- 自動テストでは新規タブまたはnavigationを捕捉し、URL契約を検証する。可能な限り外部通信を遮断し、テスト座標を実際に第三者へ送信しない。

デザインとアクセシビリティ:
- Phase 1・2の深緑・テラコッタ、カード、余白、角丸、状態表現、フォーカスリングを継続し、別アプリのような見た目にしない。
- スマートフォン390×844を主対象とし、自由時間候補と寄り道を片手で確認・操作できる情報密度にする。
- 主要操作は44×44 CSS px以上。スワイプ、長押し、ホバーだけに依存する操作を作らない。
- native controlsと適切なaria-label、aria-expanded、aria-pressed、aria-checked、live regionを使用する。
- 200%文字表示、Safe Area、prefers-reduced-motion、キーボードのみの操作、1440×900のPC表示を維持する。
- 現在地、精度、古い情報、取得エラー、第三者送信、寄り道可否を色だけに依存せず文言と形状でも伝える。
- ページ全体または旅程パネルに意図しない横スクロールを発生させない。

テスト方針:
- 既存テストを削除、skip、期待値変更による弱体化、対象コードの迂回によって通してはならない。仕様変更で既存期待値の更新が必要なら、回帰ではない根拠を報告書へ記録する。
- FR-18〜FR-21と受け入れ基準1〜16を、少なくとも一つの自動テストまたは再現可能なブラウザ・実環境検証へ対応付ける。
- 同期テストに、Flexible Blockの全許可階層、時刻要件、空コンテナ、禁止ネスト、Detour Forの型・件数・対象・旅行一致・自己/子孫参照、寄り道内Flexible Block禁止、Duration/追加時間、安定公開ID変換、古いpayload互換を追加する。
- モデルテストに、自由時間の並び・親時間範囲・三状態選択・フォーカス地図ID、寄り道のトップレベル除外・詳細関連・明示表示、次の固定予定・余裕/超過/判定不可、目的地とtravelmode解決を追加する。
- ブラウザテストに、自由時間の候補一覧、親子フォーカス・選択・フィルター・時間範囲、Item/Series/Alternative Group寄り道、地図表示条件、位置情報を初期要求しないこと、成功・拒否・timeout・unsupported、5分経過、再読み込み破棄、Google Maps URLとnoopenerを追加する。
- ブラウザのStorage、request、consoleを監視し、現在地が永続ストレージ、アプリAPI、ログへ流れないことを確認する。
- モバイル390×844、PC 1440×900、200%文字表示、reduced-motionで検証し、主要画面の画像を生成して実際に開いて確認する。
- タッチ相当、キーボードのみ、Tab、矢印、Enter、Spaceで主要操作を検証する。
- 通常シナリオでconsole error、uncaught error、意図しない横溢れがないことを検証する。意図した失敗注入によるブラウザのnetwork errorは通常時エラーと区別する。
- 最終的に `npm test`、`npm run test:browser`、`npm run build`、全JS/MJSの `node --check`、`git diff --check` を実行する。

ドキュメント:
- README.mdとdocs/DEPLOYMENT.mdに、Flexible Block、Opening Hours、Detour For、Additional Duration Minutes、Rejoin Place、正規値、Relation設定、現在地のプライバシー、Google Maps連携、運用上の注意を追記する。
- `docs/PHASE3_PLAN.md` に要件対応表、baseline、実装方針、テスト設計、Notion変更計画、デプロイ・復旧計画を記録する。
- 完了時に `docs/PHASE3_REPORT.md` を作成し、要件ごとの実装箇所、検証証拠、全コマンドと結果、変更ファイル、Git baseline/復旧手順、Notion変更、GitHub branch/PR、Cloudflare deployment、実環境検証、既知の制約を記録する。
- ローカル証拠のファイル名は報告書に記載してよいが、Git対象外とし、秘密情報・内部ID・実際の現在地を含めない。

デプロイと実環境検証:
- ローカルの全テスト、ビルド、画像確認、セキュリティ・プライバシー境界の検証が成功したcommitだけをデプロイする。
- デプロイ前に既存本番URL、Cloudflare Worker名、直前のdeployment/version ID、baseline smoke結果を記録する。秘密値は表示・保存しない。
- 既存のwrangler設定、Worker、account、environment、domainを使用する。別Worker、別account、別environment、別Secretを推測で作成しない。
- まず正規のdry-runを行い、デプロイ対象commit SHAとbuild結果を記録してから既存Workerへデプロイする。
- デプロイ後は本番URLで、Phase 1・2の主要操作、自由時間、寄り道、選択、フィルター、地図時間範囲、現在地の成功・失敗、Google Mapsリンク契約、再取得、地図失敗時の継続利用を可能な範囲でsmoke testする。
- Geolocationの本番smokeは固定テスト座標とブラウザ権限エミュレーションを使用してよい。実際の利用者の現在地を証拠へ残さない。
- Google Maps連携はpopup/navigationを捕捉してURLを検査し、外部通信を遮断できる場合は遮断する。第三者サービスの稼働自体を本アプリの完了条件にはしない。
- Notionの新規Phase 3サンプルを一時公開する場合は公開時間を最小化し、明示的な将来日付を使う。連続再取得を避け、既存クールダウンを守る。
- 実環境検証後は全Phase 3サンプルをPublish=falseへ戻して再取得し、本番API、画面、キャッシュから消えたことを確認する。既存公開行のsanitized比較が一致することも確認する。
- 本番で重大な回帰を検出した場合は追加実装を続ける前に、確認済みCloudflare rollback、またはbaseline tagから別worktree/復旧branchを作ってbuild・再デプロイする方法で復旧する。既存worktreeをresetしない。
- rollback後は本番smoke、公開API、サンプル非公開、既存データ非変更を再確認する。rollbackした場合はPhase 3完了扱いにしない。
- 本番検証成功後、deployment/version ID、時刻、commit SHA、検証条件、Notion後片付け結果をdocs/PHASE3_REPORT.mdへ記録する。

対象外と禁止事項:
- 採用候補をNotionへ保存する機能、Webからの旅程編集、経路検索API、継続位置追跡、位置履歴、オフライン/PWAを実装しない。
- 許可された追加以外のNotion DB、Data Source、プロパティ、option、Relation、既存データを変更しない。
- 既存Notionページ・プロパティ・optionを削除、archive、rename、型変更、clearしない。
- Cloudflare Worker、Secret、domain、account、environmentを削除・改名・新設しない。
- GitHub PRを自動mergeしない。force-push、既存branch/tagの削除を行わない。
- 秘密情報、内部ID、実際の現在地、予約秘密情報を表示・保存・commitしない。
- SPECIFICATION.mdを実装都合で弱めたり、受け入れ基準を削除したり、ユーザー承認なしに仕様を変更したりしない。

完了条件:
1. FR-18〜FR-21とPhase 3受け入れ基準1〜16を全て満たし、要件と証拠がdocs/PHASE3_REPORT.mdで一対一に追跡できる。
2. Phase 1・2の全機能、FR-01〜FR-17、受け入れ基準、公開境界を回帰させない。
3. 既存52単体・統合テストと20ブラウザ検証を保持し、追加テストを含む全件がfail 0、skip 0で成功する。
4. `npm test`、`npm run test:browser`、`npm run build`、全JS/MJSの `node --check`、`git diff --check` が成功する。
5. 390×844、1440×900、200%文字表示の画像を実際に確認し、自由時間、寄り道、現在地、エラー、第三者送信表示に横溢れ・重なり・操作不能がない。
6. 初期表示で位置権限を要求せず、現在地をメモリ外へ保存・アプリサーバーへ送信せず、再読み込みで破棄することを自動テストで証明する。
7. Google Mapsの目的地・travelmode・HTTPS・エンコード・noopener・第三者送信表示を全対象構造で検証する。
8. README.md、docs/DEPLOYMENT.md、docs/PHASE3_PLAN.md、docs/PHASE3_REPORT.mdが実装と一致する。
9. baseline commit/tagと専用branchがGitHubへpushされ、baselineからコードとデプロイを非破壊的に復旧する手順が検証または具体的に記録されている。
10. 実Notionへ必要なoptionと4プロパティが追加・検証され、既存データ・既存プロパティ・既存optionの削除、rename、型変更、clearが行われていない。
11. 全Phase 3サンプルが最終的にPublish=falseで、本番API・画面・キャッシュに残っておらず、既存公開行のsanitized比較が一致する。
12. 検証済みcommitが既存Cloudflare Workerへデプロイされ、本番smoke testが成功する。失敗してrollbackした場合はGoalを完了扱いにしない。
13. 最終branchがGitHubへpushされ、PRが作成され、commit SHA、deployment ID、Notion変更、実環境証拠が報告書と対応付く。
14. 未検証事項、既知の重大回帰、未達要件、外部変更の不明点を残した状態でGoalを完了にしない。

反復方針:
各実装単位で関連テストを先に設計または追加し、失敗を確認してから最小限の実装を行う。関連テストが成功した後に全テストとブラウザ検証を再実行する。失敗時はログ、再現条件、直前差分から原因を特定し、仕様を弱めず最小修正を行う。見た目だけ、テストだけ、ローカルだけ、デプロイだけ、またはドキュメントだけを完成として扱わず、要求・実装・検証証拠・外部状態が一致するまで継続する。

ブロック時:
同じブロッカーに対して安全な代替手段を十分に試しても進めない場合だけ停止する。baseline commit/tagの作成・push、対象Notion DBとRelationの一意な確認、既存データの非変更確認、現在deploymentの確認、サンプルのPublish=false復帰のいずれかができない場合は、該当する外部変更を開始または完了扱いにしない。試した内容、正確なコマンドと出力、完了済み要件、未達要件、外部変更の有無、Notionサンプルの最終状態、デプロイ状態、原因、再開に必要な具体的入力をdocs/PHASE3_REPORT.mdへ記録する。利用できない外部サービスや未検証の推測を成功扱いにせず、OS設定、既存データ、既存プロパティを無断で変更しない。
```
