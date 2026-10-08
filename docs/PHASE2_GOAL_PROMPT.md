# Phase 2 Goal プロンプト

このプロンプトは `SPECIFICATION.md` v0.3 の Phase 2 を、既存の Phase 1 を回帰させずに実装・検証するためのものです。Codex の Goal が成果、検証手段、制約、作業範囲、反復方針、ブロック時の停止条件を保持できるように構成しています。GitHub更新、Cloudflareデプロイ、Notionの追加的変更、実環境検証を許可しつつ、Gitの復旧点とNotionの非破壊制約を必須にしています。

以下を対象リポジトリを開いた Codex のチャットで使用してください。

```text
/goal SPECIFICATION.md v0.3を正式な要求仕様として、旅程表示WebアプリのPhase 2「比較・計画機能」を実装し、全てのPhase 2受け入れ基準を検証可能な証拠とともに満たす。Phase 1の機能、テスト、セキュリティ境界、Notionを正本とする構成を維持する。

対象リポジトリ:
C:\Users\wyuya\Desktop\work\06_progress_private_project\TravelWebApp\Projects\notion-itinerary-publisher

正式な要求仕様と基準資料:
- SPECIFICATION.md v0.3
- docs/PHASE1_REPORT.md
- docs/DEPLOYMENT.md
- README.md

達成する要件:
- SPECIFICATION.mdのPhase 2
- FR-12〜FR-17
- 19.2「Phase 2」の受け入れ基準1〜15
- Phase 1のFR-01〜FR-11と受け入れ基準1〜10の継続的な充足

最初に行うこと:
1. リポジトリ、仕様書、Phase 1報告、既存実装、既存テスト、git statusとremoteを読み取り専用で調査する。
2. ソース、計画書、外部状態を変更する前に、次節の方法で変更前スナップショット、専用branch、baseline tagを作成・pushする。
3. 変更前の全ての単体・統合・ブラウザテストとビルドを実行し、ベースラインを記録する。
4. Phase 2の各要件と受け入れ基準を、実装箇所、自動テスト、ブラウザ検証へ対応付けたdocs/PHASE2_PLAN.mdを作成する。
5. 現在のUI状態、公開用安定ID、Notion同期境界、地図レイヤー管理を把握してから設計する。
6. npm/Volta shimが失敗する場合はOS設定を変更せず、docs/PHASE1_REPORT.md記載のNode.js v24.21.0実体を使用する。利用できない場合は別の安全な既存Node.js 24以上を確認する。

変更前スナップショットとGit運用:
- 実装前にgit status、現在のbranch、HEAD、remote、既定branchを確認する。既存の変更や未追跡ファイルを破棄・上書き・stashしない。
- 作業開始時の状態を正確に復元できるよう、専用作業branch `codex/phase2-YYYYMMDD-HHMMSS` を作成する。
- 作業ツリーがdirtyなら、内容と機密性を確認し、このタスクに属する安全なファイルを専用branch上のベースラインsnapshot commitとして保存する。不明な変更や秘密情報を含む可能性がある場合は勝手にcommitせず、外部変更前にブロッカーとして報告する。
- 実装前の正確なcommitへannotated tag `phase2-baseline-YYYYMMDD-HHMMSS` を作成し、branchとtagをoriginへpushする。baseline commit SHA、tag、branchをdocs/PHASE2_PLAN.mdへ記録する。
- 実装中はデータ変換、UI、テスト、ドキュメント等の意味のある単位でcheckpoint commitを作り、定期的に専用branchへpushする。
- force-push、履歴書き換え、remote branch/tagの削除、共有branchのrebaseを行わない。秘密情報、ローカル証拠、Notion内部ID、Cloudflare tokenをcommitしない。
- 全ローカル検証後に最終commitをpushする。GitHub CLIまたは接続が利用できる場合はPhase 2のPRを作成してよいが、自動mergeは行わない。
- 復旧方法は破壊的なresetではなく、baseline tagから新しい復旧branchを作る方法をdocs/PHASE2_REPORT.mdに記載する。

データ構造:
- 専用のグループDBを追加してはならない。
- 既存のItinerary Items DBにStructure Selectと同一DBへのParent Relationを追加する前提で実装する。
- Structureの正規値はItem、Alternative Group、Series。未設定は既存データとの互換性のためItemとして扱う。
- Parentは0または1件。APIではNotion Relation IDを公開せず、公開用安定IDへ変換したparentIdを返す。
- 許可階層は、ルートの各構造、Alternative Group→Item/Series、Series→Itemだけとする。
- 最大階層はAlternative Group→Series→Item。
- 循環、複数親、旅行不一致、非公開親、孤立参照、禁止ネスト、Itemの子、公開された空コンテナを同期エラーにする。
- 公開Alternative Groupは2件以上の公開直接候補、公開Seriesは1件以上の公開直接Itemを必要とする。
- 親Periodがなければ子から算出し、設定済みPeriodが子の期間を包含しなければ同期エラーにする。
- 親のその他プロパティを子へ暗黙継承しない。
- 公開APIはstructureとparentIdを持つフラットなノード配列を維持し、ブラウザ側でツリーを構築する。
- 新しいDB、Data Source ID、Worker Secret、外部サービスを追加しない。

Notion実環境の変更権限と制約:
- 接続済みの実Notionを調査し、Itinerary ItemsへStructure Select、正規Select options、同一DBへのParent Relationを追加してよい。既に同名プロパティがある場合は型と設定を検証して再利用し、重複プロパティを作らない。
- 変更前に、DB名、プロパティ名、型、Select options、Relationの向き、公開対象件数を、秘密情報や内部IDを除いたsanitized baselineとしてdocs/PHASE2_PLAN.mdへ記録する。
- 既存プロパティの削除、名前変更、型変更、既存optionの削除、既存Relationの解除、既存ページの削除・archive、既存値のclear、既存行の一括更新を禁止する。
- 既存行は原則read-onlyとする。Structure未設定をItemとして扱う後方互換により、既存行へ値を一括入力しない。
- Phase 2検証専用のサンプル行は追加してよい。名称に `[Phase2 Sample]` を付け、既存行を親または子として再利用せず、新規サンプルだけでAlternative Group→Series→Itemと単独候補を構成する。
- サンプルはPublish=falseで作成する。実公開テストに必要な時間だけ、新規サンプルに限ってPublish=trueへ変更してよい。テスト後は必ずPublish=falseへ戻し、再取得後に公開画面とAPIから消えたことを確認する。
- 追加したサンプル行は削除・archiveせず、Publish=falseのまま識別可能に残す。追加したStructure/Parentプロパティも削除せず、baseline codeが無視できる非破壊的な追加として残す。
- Notion変更ごとに、変更したプロパティまたは新規サンプルの名称、目的、実施時刻、最終Publish状態を、内部IDや秘密情報を含めずdocs/PHASE2_REPORT.mdへ記録する。
- 予定外に既存データまたは既存プロパティの変更が必要になった場合は実行せず、ブロッカーとしてユーザー入力を求める。

UI状態と操作:
- Phase 1のselectedDay、単一フォーカス、項目別詳細展開、mapPanelMode、更新元の状態を維持する。
- selectedIds、activeCandidateByGroup、filters、mapTimeRange等を独立した状態として追加する。
- 全旅程ノードでフォーカスは一つ。選択は複数で、フォーカスと相互に変更しない。
- 選択は比較・地図強調用のブラウザ内状態で、Notionへ保存しない。
- 日付・フィルター変更時は選択を保持し、再取得後は存在する公開IDだけを保持する。
- 親の選択状態は全公開子孫Itemから未選択・一部選択・全選択を算出する。
- 候補グループはモバイルで1件、PCで幅に応じて2〜3件表示する。
- スワイプだけに依存せず、ボタンとキーボードでも候補を切り替えられるようにする。
- 候補グループごとにアクティブ候補を一つ持ち、フォーカスと地図を仕様どおり同期する。
- 系列は一つの候補として表示し、詳細内に子のタイムラインを表示する。子も個別にフォーカス・詳細展開できるようにする。
- コンテナと子の同じ地点を重複表示しない。

フィルター:
- 日程種別、計画状態、予約状態、移動手段、選択項目のみを提供する。日付は既存の日付タブを使用する。
- 同一分類内はOR、異なる分類間はAND。
- 予約未完了ショートカットはRequiredまたはPending。
- Cancelledは既定で非表示とし、明示操作で表示する。
- コンテナ自身が一致すれば全ての子を表示する。一致しなくても一致する子孫があれば祖先を維持し、一致する子孫だけを表示する。
- フィルターで非表示になった選択を保持し、非表示件数を表示する。
- フォーカス中ノードが除外された場合は通知してフォーカスを解除する。

地図表示時間範囲:
- 選択日の表示項目から初期範囲を決め、項目なしまたは終日のみなら00:00〜24:00とする。
- 開始・終了を15分単位で指定できる、タッチ・キーボード双方で操作可能なUIにする。
- 区間の重なり、終了なし、終日、コンテナ代表時間を仕様どおり判定する。
- 前へ・次へは現在の範囲幅を維持し、日付境界で止める。
- 時間範囲は地図だけに適用し、タイムラインと選択状態へ影響させない。

デザインとアクセシビリティ:
- Phase 1で確立した深緑・テラコッタ・カード・余白・角丸・フォーカスリングを継続する。
- 主要操作は44×44 CSS px以上。
- スワイプ、ホバー、長押しだけに依存する操作を作らない。
- native controls、適切なaria-expanded、aria-pressed、aria-checked="mixed"、live regionを使用する。
- Safe Area、200%文字表示、prefers-reduced-motion、キーボード操作を維持する。
- 横方向の候補表示によってページ全体に意図しない横スクロールを発生させない。

テスト方針:
- 既存テストを削除、skip、期待値の弱体化によって通してはならない。
- 各Phase 2要件と受け入れ基準を、少なくとも一つの自動テストまたは再現可能なブラウザ検証へ対応付ける。
- 同期テストに、全許可階層と、循環、複数親、旅行不一致、非公開親、禁止ネスト、空コンテナ、Period不包含、公開ID変換を追加する。
- モデルテストに、ツリー構築、代表時間、候補順、三状態選択、状態の維持とprune、OR/ANDフィルター、祖先保持、時間区間の重なりを追加する。
- ブラウザテストに、候補切替、系列内操作、親子選択、地図強調、フィルター、予約未完了、Cancelled表示、非表示選択件数、地図時間範囲、再取得後の状態を追加する。
- モバイル390×844とPC 1440×900で検証し、200%文字表示とreduced-motionも確認する。
- タッチ相当、キーボードのみ、矢印キー、Enter、Spaceで主要操作を検証する。
- 通常シナリオでコンソールエラー、uncaught error、意図しない横溢れがないことを検証する。
- Phase 1の全単体・統合テストと13ブラウザシナリオを継続して成功させる。

ドキュメント:
- README.mdとdocs/DEPLOYMENT.mdにStructure、Parent、正規値、Notionでの自己Relation設定、既存項目をItemとして移行する手順を追記する。
- 実Notionに行った追加変更と、既存データを変更しなかったことを記録する。
- 完了時にdocs/PHASE2_REPORT.mdを作成し、要件ごとの実装箇所、検証証拠、全コマンドと結果、変更ファイル、Git baseline/復旧手順、Notion変更、GitHub branch/PR、Cloudflare deployment、実環境検証、既知の制約を記録する。

デプロイと実環境検証:
- ローカルの全テスト、ビルド、画像確認、セキュリティ境界の検証が成功したcommitだけをデプロイする。
- デプロイ前に現在の本番URL、Cloudflare Worker名、直前のdeployment/version ID、baseline smoke test結果を記録する。秘密値は表示・保存しない。
- デプロイ対象のcommit SHAとローカルbuild結果を記録し、既存のwrangler設定と正規のデプロイ手順を使用する。別Worker、別account、別environmentを推測で作成しない。
- デプロイ後は本番URLで、初期表示、日付、Phase 1操作、候補、系列、選択、フィルター、地図時間範囲、手動再取得、地図失敗時の継続利用を可能な範囲でsmoke testする。
- Notionの新規サンプルを一時公開して検証する場合は、公開時間を最小化し、明示的な将来日付と `[Phase2 Sample]` 名称を使う。検証後はPublish=falseへ戻して再取得し、本番APIと画面から消えたことを確認する。
- 実環境テストでは既存の旅行項目、既存プロパティ、予約情報、秘密情報を変更しない。負荷試験、破壊的検証、大量ページ作成、連続更新を行わない。
- 本番で重大な回帰を検出した場合は追加実装を続ける前に、Cloudflareの確認済みrollback機能、またはbaseline tagを別worktree/復旧branchでbuildして再デプロイする方法でPhase 1へ戻す。既存worktreeをresetしてはならない。
- rollback後は本番smoke testを行い、新規NotionサンプルをPublish=falseにして、復旧証拠を記録する。
- 本番検証成功後、deployment/version ID、時刻、commit SHA、確認項目をdocs/PHASE2_REPORT.mdへ記録する。

対象外と制約:
- Phase 3の自由時間、寄り道、現在地を実装しない。
- 採用候補をNotionへ保存する機能を追加しない。
- Webからの旅程編集を追加しない。
- 許可された追加変更以外のNotionデータ・プロパティを変更しない。
- GitHubの専用branch・baseline tag・checkpoint/final commit・PR作成、Cloudflareへのデプロイ、Notionへの追加的なスキーマ・サンプル操作は上記の制約内で許可する。
- GitHub PRの自動merge、force-push、既存branch/tagの削除、Cloudflare Worker/secret/domainの削除・改名を行わない。
- 秘密情報を追加・表示しない。
- SPECIFICATION.mdを実装都合で弱めたり、未承認の仕様へ変更したりしない。

完了条件:
1. FR-12〜FR-17とPhase 2受け入れ基準1〜15を全て満たす。
2. Phase 1のFR-01〜FR-11と受け入れ基準1〜10を回帰させない。
3. 既存および追加した単体・統合・ブラウザテストが全て成功し、fail 0、skip 0である。
4. npm test、npm run test:browser、npm run build、全JS/MJSのnode --check、git diff --checkが成功する。
5. 390×844、1440×900、200%文字表示の画像を実際に確認し、候補・系列・フィルター・時間範囲の配置と操作性に問題がない。
6. README.md、docs/DEPLOYMENT.md、docs/PHASE2_PLAN.md、docs/PHASE2_REPORT.mdが実装と一致する。
7. baseline commit/tagと専用branchがGitHubにpushされ、baselineからコードとデプロイを復旧する非破壊的手順が検証または具体的に記録されている。
8. 実NotionにStructure/Parentと必要なoptionが追加され、既存データ・既存プロパティの削除、rename、型変更、clearが行われていない。
9. 全サンプル行が最終的にPublish=falseであり、本番APIと公開画面に残っていない。
10. 検証済みcommitがCloudflareへデプロイされ、本番smoke testが成功している。失敗してrollbackした場合はGoalを完了扱いにせず、未達として報告する。
11. 最終branchがGitHubへpushされ、利用可能ならPRが作成され、commit SHA・deployment ID・Notion変更・実環境証拠が報告書に対応付いている。
12. 未検証事項や仕様未達を残した状態でGoalを完了にしない。

反復方針:
各実装単位で関連テストを追加または更新し、失敗時は原因を特定して最小限の修正を行う。関連テストが通った後に全テストとブラウザ検証を再実行する。見た目だけ、テストだけ、またはドキュメントだけを完成として扱わず、要求・実装・検証証拠が一致するまで継続する。

ブロック時:
同じブロッカーに対して安全な代替手段を十分に試しても進めない場合だけ停止する。baseline commit/tagの作成・push、Notion対象DBとプロパティの一意な確認、またはCloudflareの現在deploymentの確認ができない場合は、該当する外部変更を開始しない。試した内容、正確なコマンドと出力、完了済み要件、未達要件、外部変更の有無、原因、再開に必要な具体的入力をdocs/PHASE2_REPORT.mdへ記録する。実行環境や外部サービスが利用できない場合も成功扱いにせず、OS設定、既存データ、既存プロパティを無断で変更しない。
```
