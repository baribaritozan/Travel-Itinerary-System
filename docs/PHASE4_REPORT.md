# Phase 4 実装・検証報告

2026-10-12。正式仕様: SPECIFICATION.md v0.5 §23。実装branch: `codex/phase4-20261012`。PRは作成後に記録し、mergeは行わない。

## 実装

| 要件 | 実装内容・証拠 |
| --- | --- |
| FR-22 | offline.mjsの許可フィールドserializerとIndexedDB transaction。明示保存後の公開1旅行最新版だけ。UI state/GPSは非保存。phase4.testのserialization/境界、pwa-checkの全record/cache/API走査。 |
| FR-23 | 30×24時間、同期版比較、同版/古い応答/stale/throttledで延長しない。新しい正常版で全体置換。期限切れpayload削除とmetadata。phase4.testの期限境界/遅延/置換、pwa-checkの起動/画面復帰期限・削除項目。 |
| FR-24 | 明示登録の実SW、同一origin Leaflet/同梱LICENSE、manifest/192・512icons、内容hash付きassetsとSHA-256完全検証。API/POST/背景タイル/外部は非cache。永続profileを終了→圏外再起動して全操作確認。 |
| FR-25 | 保存/期限/通信/インストール区別、削除、容量不足/破損/404/5xx/3秒timeout。新版待機・複数タブ制限。部分install失敗で旧版を保持。復旧SWはcache/DB/登録退役後baselineへ画面再読み込み。pwa-checkとrecovery dry-run。 |
| FR-26 | 中点の交通手段icon+名称、重複抑制とfocus優先、popupの地点/時間/手段。44px hit/keyboard/概略線注記維持。browser-checkの交通手段popup・focus・画像。 |
| FR-27 | From→To区間解決とURL生成を分離、座標優先/住所fallback、欠落理由/2048文字/固定HTTPS/encoding/手段対応。現在地発は既存目的地規則維持。コピー失敗でも選択可能text。phase4.testの全手段/危険文字/長さ、browser-checkの実popup opener=null/GPS呼出0/copy。 |

## 自動検証・画像

| コマンド | 結果・ローカル証拠 |
| --- | --- |
| 変更前 npm test / npm run test:browser | 93/35全通過。phase4-baseline-unit.log / phase4-baseline-browser.log |
| npm test | 109全通過。既存93件維持、新規16件。phase4-unit.log |
| npm run test:browser | 39全通過。既存35件維持、新規4件。phase4-browser.log |
| npm run test:pwa | 実SW・永続profileの8件全通過。phase4-pwa.log |
| npm run build / 全JS・MJS node --check / git diff --check | build成功、22source files構文成功、差分問題なし |
| npm run build:recovery / wrangler deploy --config artifacts/phase4-recovery-wrangler.jsonc --dry-run | 既存Worker設定で復旧ビルド生成・dry-run成功。phase4-recovery-dry-run.log |

Windows/Chrome。Volta shimを避けNode v24.21.0の実体を子process PATHへ指定。localhost/外部通信はsandboxで遮断されるため、ブラウザ・Git・Wranglerは権限を切り替えて実行した。OS設定変更なし。

画像を生成して開いて確認: phase4-mobile.png、phase4-desktop.png、phase4-mobile-200.png、phase4-desktop-200.png、phase4-offline-mobile.png。390×844/1440×900、200%文字、reduced-motion、keyboard。横overflowなし。ブラウザfixtureは実Leafletを同一originから配信し、通常回帰検証だけ計測を追加。PWA検証は実build/実SW/hash検証をそのまま使う。

発見・修正: コピー操作で変わったTab順を既存外部リンク優先へ修正。Chrome永続profileはWindows MAX_PATHによるCache.put失敗を避け短いtmp pathを使用。SW-only更新もbuild版に含め、失敗版cacheを削除。fetchにCacheStorage.matchを使い削除cacheの再作成を防止。緊急復旧は旧画面の保留処理を終了してbaseline UIへ戻し、cache/登録消去の一時状態ではなく最終旧UIまで検証。

## 本番baseline・外部変更

Worker: `travel-itinerary`、URL: https://travel-itinerary.baribaritozan.workers.dev 。変更前deployment `afa922c1-0fa9-446e-b104-2c30d479bb31`、version `32964f5b-749a-4af1-a811-2e55eaf1bba6`、100%。phase4-baseline-deployment.json。

作業時の公開APIは19 items/2 places、Phase 3 Sample 11件が既に公開されていた（前回Phase 3完了報告後の更新）。generatedAt `2026-10-12T11:01:18.639Z`、payload SHA-256 `1fec942d4a43b395a22f474ddc1b9c0b8f37646d42a2dd357f6e85d71ad7af7a`。現在状態をbaselineとして保持し、Notionへの変更・refresh POSTは今回行わない。公開IDのhash形式・画面操作・位置要求0・前後payload一致を確認。phase4-production-baseline.json、baseline画像2枚。

本番deploy/version/最終smoke/PR: ローカル最終検証後に実施・追記する。

## 復旧・制約

Git baseline `6c334c1`、annotated tag `phase4-baseline-20261012`、専用branchを実装前にoriginへpush済み。復旧時は `node scripts/recovery-build.mjs phase4-baseline-20261012` → 生成configでdry-run/deploy。既存Worker/DO/bindings/varsを使用し、元checkoutはresetしない。復旧workerによる退役・旧UIをローカルで検証済み。実本番でのrollbackは必要がない限り行わない。

背景地図はオンラインのみ。iPhone/Android実機確認は後続で、今回の完了表現は自動・本番Chrome検証済みとする。ブラウザeviction、閉じた端末の正確な期限時刻の物理削除、圏外端末への公開取り下げ即時反映は保証しない。経由地/Series連結/寄り道復帰リンクは後続。新地図契約・Notion変更・Cloudflareリソース新設・PR mergeは行わない。
