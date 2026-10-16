# Phase 5 実装・ローカル検証報告

2026-10-16。正式要件はSPECIFICATION.md v0.6 FR-28〜FR-33 / §24。今回の完了範囲はローカル実装・自動検証・ブラウザ操作・実画像確認・説明更新。本番公開は別工程。最終結果の機械可読記録は [PHASE5_EVIDENCE.json](PHASE5_EVIDENCE.json)。

本書はローカル実装完了時の記録。確認後のユーザー指示「本番公開及びgithub同期」による追加作業は [PHASE5_PUBLISH_REPORT.md](PHASE5_PUBLISH_REPORT.md) に記録する。

## 開始状態と変更境界

- 開始SHA: `5115adbe3d4d06b333a9f9e1bd1f4b01cfce8ee4`、branch: `codex/phase4-20261012`。祖先とリポジトリ内に適用AGENTS.mdなし。同じcheckoutで作業し、reset/stash/既存変更の破棄はしていない。
- 開始時のREADME.md / SPECIFICATION.mdの変更、未追跡のPHASE5_GOAL_PROMPT.md / PHASE5_PLAN.md / docs/design/を入力として保持。承認PNG2枚を開き、HTMLモックの候補切替・案名全画面をブラウザで操作した。
- 製品変更はpublic/app.js / public/styles.css。公開payload、Notion、Worker/DO、model/offline/pwa/swの処理、CSP、buildのasset列挙は変更しない。起動用16ファイルの内容hash更新で新UIを配信できる。追加の製品moduleやCDN依存はない。
- UI状態はメモリ限定。既存の公開payload許可フィールド、30日、同版延長なし、削除、404/5xx、GPS非保存・一回明示取得を維持。remote push / PR / merge / deploy / Notion操作は行っていない。

## 実装

階層を見出し・本文・自由時間の帯へ変更した。Seriesの子は常時本文に表示し、詳細は各ノード自身の補足情報と操作を受け持つ。本文の幅は階層によって縮小しない。カードの外の共通レールはResizeObserverで見出し中心へ配置し、実際の表示中の候補だけを扱う。PCの各比較列は独立した軸を持つ。

候補はnative scroll-snapで案名と本文が同時に動く。前後・左右/Home/End、位置表示、端の無効化、1候補時の操作省略、非表示候補のinertを提供する。タッチの横移動と縦スクロール・案名タップを区別する。非表示になった旧候補のフォーカスは新候補へ解決し、プログラムスクロールやDOM更新で古い候補へ戻さない。

全画面対象と親の公開ID/相対位置を独立して保持する。戻る/Escape/旅程で最新版の候補・詳細・選択・フィルター・地図時間範囲・モードを保って復帰する。対象削除/フィルター除外時には通知して日程へ戻す。日付・親日程操作は全画面中に隠す。

旅程・地図・比較・その他を下部にまとめた。初期地図は最小、比較中だけ選択操作を表示する。その他のmodal dialogはネイティブのフォーカス制御を使い、深くスクロールしても見出しと閉じる操作を固定する。通知はメニュー外にも出す。拡大地図はSafe Areaと200%文字を含む実メニューバー高を避ける。深緑・ニュートラル・薄い区切り・角丸5pxを採用した。

## 受入条件と証拠

ブラウザ検証は `scripts/browser-check.mjs`、PWA検証は `scripts/pwa-check.mjs`。以下の「P5」は同ファイルの `Phase 5 AC…` テスト名を指す。全て実Leaflet・合成公開payloadで検証する。

| AC | 実装箇所 | 自動・ブラウザ証拠 |
| --- | --- | --- |
| AC5-01 | cardHtml / Series本文 / 自由時間帯 | P5 AC01/02/10/11/12。最大Alternative Group→Series→Flexible Block→Itemの本文左端差2px以内、単独Series、候補3構造。 |
| AC5-02 | candidateHtml / setupCandidates | P5 AC01、AC02/09/10、既存Phase 2 mobile。3候補、長名、端、Home/End、フィルターで1件・操作省略。重複表示トグル0件。 |
| AC5-03 | native carousel / pointer gesture | P5 AC03/04。CDP Input.dispatchTouchEventで横スワイプと縦移動を別々に実行し、実スクロール・切替・全画面誤発火なしを確認。旧Phase 2の実タッチも保持。 |
| AC5-04 | activateCandidate / inert / scroll抑止 | P5 AC02/04、AC03/04。地図・位置・案名・本文一致、詳細/比較保持、旧子のフォーカス解決、18回のTabでinert内へ入らない。 |
| AC5-05 | openScene / browsingRoots | P5 AC02/04/05/06/09/13/16。Item/Series/Flexible Blockと単独Series、地図拡大、比較、詳細。案名を開くだけではフォーカス/比較/詳細を変更しない。 |
| AC5-06 | parentAnchor / closeScene / mapReturnMode | 上記P5とP5 AC06/08/09/12。親の相対位置差3px未満、最後の候補、最新の詳細/選択/Cancelledフィルター/地図開始570・終了720/地図標準を保持。Escape/戻る/旅程。 |
| AC5-07 | renderItemsのscene有効性判定 | P5 AC07/08/12。再取得で対象削除、フィルターで対象除外、対象ID破棄・通知・有効な日程。 |
| AC5-08 | setupShellの移設と既存イベント | 既存39ブラウザ/9 PWAの全機能検証を維持。ui-navigation.mjsは実メニュー/比較/地図ボタンを操作して到達し、アプリ関数やhidden操作の強制実行はしない。再取得/保存/削除/全閉/フィルター/時間/外部リンクを実処理で確認。 |
| AC5-09 | comparisonMode / paintModes / 既存selectionState | P5 AC02/04、AC06/08、既存Phase 2 selection/filter。通常非表示、終了後の件数・選択保持、非表示件数、全解除、全公開子孫による三状態。 |
| AC5-10 | renderRail / ResizeObserver | P5 measureRailの9 JSON。通常/詳細開閉/切替/全画面/320/390/低い高/1440/200%で各見出し中心差2px以内、モバイル共通軸差2px以内。時刻未定の自由時間候補に独立ノードなし。 |
| AC5-11 | itemTime / 既存modelの旅行TZ・代表期間 | P5 AC01と既存modelテスト。ブラウザTZはLA、旅行TZはTokyo。終了なし14:00、終日、23:30→翌日01:00の日付表示。親を行動時間へ加算する処理は追加していない。 |
| AC5-12 | warnings / publish-status / state-notice | 予約未完了、detour予定超過、既存stale/refresh失敗/地図失敗、PWA quota/期限/更新待機/圏外、フィルター通知。失敗通知はdialogを閉じても確認できる。正常/全画面/その他/圏外の実画像。 |
| AC5-13 | setMapMode / resize / browsingRoots | 初期minimal、標準36dvh、拡大と直前閲覧への復帰、双方向focus、旧Phase 1/2のfit/pan/zoom保持。1440で3列、1100で2列、各列の軸を分離。 |
| AC5-14 | CSS / native dialog / menu-height | P5 responsive、既存200%/低高/keyboard/reduced-motion/44px検証。320、390×844、390×450、1440×900、320の200%文字。本文の横溢れなし、barは画面下・本文と重ならず、拡大地図も実バー高を避ける。 |
| AC5-15 | 既存offline/SWと新しいUI | PWA明示保存・終了後圏外再起動、P5移行の圏外候補/全画面/比較/その他/地図操作。UI状態/GPSの非保存、30日・同版・削除・404/5xx・破損・quotaを既存テストで維持。 |
| AC5-16 | 既存requestLocation / detailsの外部経路 | P5初期/メニュー/候補/全画面でGPS0。既存全交通手段・固定位置・URL長/encoding・住所fallback・opener=null・コピー失敗/成功・秘密情報境界。Google/外部通信は捕捉し、実現在地は取得しない。 |
| AC5-17 | 旧UI再ビルド / 実SW更新・永続profile | PWA P5 AC15/16/17。開始SHAの実旧UIで保存→待機中reload0→明示切替でreload1→新asset集合のみ→保存record完全一致→profile終了→圏外再起動。従来の部分install失敗/複数タブ/復旧/既知不良版回復も維持。 |
| AC5-18 | scripts / README / 本報告 | 下記の全コマンド・実画像・機械可読証拠。既存テストの削除/skipなし。未実施の実機をローカル検証成功と混同しない。 |

## コマンド・環境

Node v24.21.0の既存実体と同梱npm-cli.jsを子process PATHに指定。Playwright 1.62.1、Windowsの既存Google Chrome 155.0.8059.79。sandbox内のlocalhostはERR_NETWORK_ACCESS_DENIEDだったため、ブラウザ検証だけ必要な実行権限を用いた。OS設定変更・新しい依存のインストールはない。

| 検証 | 結果 | artifacts内ログ |
| --- | --- | --- |
| 開始時 単体/統合 | 109成功 | phase5-baseline-unit.log |
| 開始時 ブラウザ | 39成功 | phase5-baseline-browser.log |
| 開始時 PWA | 9成功 | phase5-baseline-pwa-clock.log |
| 最終 npm test | 109成功 | phase5-unit.log |
| 最終 npm run test:browser | 45成功（既存39＋新規6） | phase5-browser.log |
| 最終 npm run test:pwa | 10成功（既存9＋実旧UI移行1） | phase5-pwa.log |
| npm run build | 成功、起動用16ファイル | phase5-build.log |
| node --check | 26 JS/MJS成功 | phase5-syntax.log |
| git diff --check | 成功 | phase5-diff.log |

baselineのPWA fixtureは実行日が旅行期間外になると予定なしの日を初期選択していた。テストの時計を2026-10-12へ固定し、実タイマーと製品の日時規則は維持して9件成功を確認した。開始時の失敗ログも保持。最終実装の必須ローカル検証は未検証扱いで残さない。

最終buildは `7cb8e398d4aa3339`。計164件成功、失敗・skip各0。9条件のレール中心差は最大0.0078125 CSS pxで、2px基準を満たした。本文/背景・補助文字/白・白/深緑・注意文字/白のコントラストも4.5:1以上を数値確認した。旧UI移行の新版cacheと最終buildの版一致を機械可読証拠生成時に再確認している。

## 旧期待値と新しい保証

| 旧UIの期待 | Phase 5仕様 / 対応AC | 代わりの検証 |
| --- | --- | --- |
| モバイル地図は初期standard、画面全高へ拡大 | 初期minimal、下部barを避けて拡大（AC13/14） | 新規初期minimal検証。旧機能テストは地図ボタンで標準へ進み、拡大＋実バー高が画面高に一致。 |
| 候補表示トグル/data-activate | 案名＋本文が一体、重複トグルなし（AC02〜04） | 実キー操作/前後/タッチとdata-active、inert、地図・focusを確認。 |
| Series詳細を開いて子を表示 | 子は本文側に常時表示（AC01） | 親詳細falseのまま子が表示されることを明示確認。親自身の詳細操作は維持。 |
| 選択操作・filter/time/save/refreshが本文に常設 | 比較modeとその他・地図へ移設（AC08/09） | 実入口から到達するnavigation helper。全ての旧機能assertionを維持し、通常時非表示とmode終了後保持を追加。 |
| ノードはarticleの子 | 外側共通rail（AC10） | 公開ID対応のdata-rail-idから実ボタンを操作。中心座標・44px・軸を実測。 |
| desktop pane高900、focus spot450 | 実メニューバー分を除くpane（AC13/14） | pane＋bar＝900、pane高の50%へmap-origin focus。 |
| SVG全体bbox中心へtap | 実際の線が短くpin/viewportに重なる場合がある | zoom後、画面内でelementFromPointが実pathとなる座標を読み、touchscreen.tapで実入力。強制clickや実処理迂回はしない。 |

テストのRAF/ResizeObserverはネイティブrenderer lifecycleを待つ。2px基準を緩めず、fake timerの先行による未描画測定を避けた。再読み込み中のsync要素pollは要素存在も待つ。検証用の一時編集helperがnode --testに拾われた際はhelper名を変更し、重複追加を整理した。既存109/39/9の対象は減らしていない。

## 実画像・ブラウザ操作

以下のPNGを生成後に実際に開いて確認した。成果物はローカルartifacts配下（Git対象外）で、テストから再生成できる。

- phase5-normal.png：通常旅程、左外側の時間・ノード、常設選択なし、下部bar。
- phase5-switched.png / phase5-fullscreen.png：切替後、独立した全画面、詳細・比較保持、深緑の案名。
- phase5-comparison.png / phase5-other-menu.png：比較操作とその他の実メニュー。
- phase5-standard-map.png：標準地図と旅程。実Leaflet、背景は通信捕捉したfixture tile。
- phase5-maximum-hierarchy.png：最大階層の本文と共通rail。
- phase5-desktop.png：1440×900、左旅程・右地図、3候補の並列軸。
- phase5-320-text-200.png：320px/200%文字、横溢れ・操作欠落なし。
- phase5-offline.png / phase5-legacy-update-waiting.png：圏外新UIと実旧UIの更新待機。

画像確認で発見した上側barのflex順序、短い候補での縦スクロール吸収、幅変更時の自動scroll anchor、desktopへの復帰時の地図fit、長いmenu内の閉じる操作を修正した。圏外・更新待機・保存失敗・期限・絞り込みは下部「その他」の短い文言でも常時判断できる。濃色背景を案名だけに限定し、予約未完了等は明るい背景に残した。404/期限切れ/取得失敗で画面を置き換える際にはResizeObserverとイベントを破棄することもPWA検証で確認した。承認モックの優先順位（旅程を主、共通幅、外側rail、案名一体スワイプ、4入口）を維持し、製品の施設・経路・保存等の実操作を補っている。モックの固定データ・window.openai・Tweak・ホストLucideは移植していない。

## ローカル確認・制約

`npm run preview:phase5` → `http://127.0.0.1:4175`。合成データだけで当日のfixtureを表示する。`/approved-mock`は保存済みの承認HTMLをUTF-8で表示する。案名→全画面→候補切替→戻る、比較→選択→終了、その他の各操作を確認できる。

今回の完了表現はWindows/Chromeのローカル自動検証とCodex内ブラウザ操作・画像確認に限定する。iPhone/Android実機は未実施。実本番の公開・Notion入力・新しい地図契約は行っていない。背景タイルの圏外保存、ブラウザeviction、閉じた端末への取り下げ即時反映などは既存Phase 4の制限のまま。必須ローカル検証の不足として実機未確認を扱っていない。
