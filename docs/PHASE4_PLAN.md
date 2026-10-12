# Phase 4 実装計画（確定）

2026-10-12。正式要件はSPECIFICATION.md v0.5 §23。ユーザー承認済み計画を実装する。PR mergeは別判断。

Baseline: `6c334c1`、branch `codex/phase4-20261012`、annotated tag `phase4-baseline-20261012`。両方originへpush済み。作業開始時clean。既存93単体・統合/35ブラウザ全通過（localhost制限のためブラウザはsandbox外）。本番baseline deployment `afa922c1-0fa9-446e-b104-2c30d479bb31`、version `32964f5b-749a-4af1-a811-2e55eaf1bba6`、100%。

| 要件 | 実装 | 検証 |
| --- | --- | --- |
| FR-22/23 | public/offline.mjs、app.js | tests/phase4.test.mjs、scripts/pwa-check.mjs：allowlist、30日、同版/新版、期限切れ、遅延、不正、容量 |
| FR-24/25 | public/pwa.mjs、sw.js、manifest、scripts/build.mjs | pwa-check：実SW/永続profile終了・圏外再起動、cache内容、明示保存、削除、404/5xx、更新/復旧 |
| FR-26 | app.js中点label・popup | browser-check：交通手段・重複・keyboard、既存地図検証 |
| FR-27 | model.mjsの区間解決/URL生成、app.js | phase4.test・browser-check：全手段・欠落・address・encoding・長さ・noopener・copy |
| 公開境界・回帰 | 既存Worker/Notion変更なし | 既存93+35、保存/通信/consoleのGPS走査、本番Chrome |

保存は明示有効化後のみ。30日を同版で延長しない。背景タイルを永続保存しない。対象はiPhone/Android想定、今回はChrome自動・本番確認、実機は後続。

手順: 保存モデル→UI→PWA/hash build→地図/経路→回帰/永続profile/更新/復旧→画像→commit/push→既存Worker dry-run/deploy→本番smoke→report/PR。

復旧: `node scripts/recovery-build.mjs`でbaseline assetとnetwork-only復旧SWをartifactsへ作成し、ローカルで更新・cache消去・旧UI確認後、必要時だけ `wrangler deploy --config artifacts/phase4-recovery-wrangler.jsonc`。設定は既存Worker/bindings/varsの複製。Cloudflare version rollbackだけでは旧SWが残るため復旧完了としない。元checkoutはresetしない。
