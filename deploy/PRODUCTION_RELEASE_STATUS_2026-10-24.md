## 2026-10-24 最新最高優先正式決議覆寫
1. Starry Battery 永久免費，不可販售、儲值、內購、外購、訂閱換購或使用任何付款事件核發電池。舊「付費電池、IAP 購買、未來購買功能保留」內容已全部廢止；免費贈送等仍依 M06 授權、稽核與去重。
2. 未正式上線前不向使用者提供 Preview/Sandbox 網站網址或要求手動測試；仍須完成所有內部 CI/Preview、真實安全 E2E、正式授權與回退。符合 Gate 後直接 Production 發布並回報核實正式結果，不得因跳過 user preview 而跳過安全驗收。
3. 本檔歷史 dark-deploy 證據仍不代表正式會員 API 已上線；Production 金融/交易開關與資料庫保持原狀直到通過必要 Gate。

# Starry Battery｜Production 發布實際盤點｜2026-10-24

> **狀態：正式 D1/R2 與**三個私有暗部署 Production Workers** 均已建置；仍未公開／未啟用會員扣款。**
> 使用者已授權啟動正式部署，但未授權跳過必要身分、財務帳務安全驗收。

## 已執行且 Cloudflare 讀回確認
| 資源 | ID / 名稱 | 狀態 |
| --- | --- | --- |
| Battery 專屬 Production D1 | `starry-battery-production` UUID `6fb69a9b-11b2-4794-950b-004db41d3343` | 2026-10-24 建立 |
| Battery 專屬 Production R2 | `starry-battery-ledger-production` | 2026-10-24 建立 |
| D1 schema | PR #37 `central-id-v2/battery/schema.sql`；Git blob `702045b77085e30b72ba5a1debe09bc37d202a92` | 空庫安全確認後 D1 查詢 API 成功執行 18 語句 |
| D1 table | `battery_app_clients`, `battery_app_rate_limits`, `battery_archive_index`, `battery_credit_receipts`, `battery_ledger`, `battery_lots`, `battery_overdraft_accounts`, `battery_reservation_allocations`, `battery_reservations`, `battery_wallets` | 實際列舉 10 張 |
| Production wallet/App/ledger/debt/archive | 在 Production D1 的 SELECT COUNT 讀回 | **全部 0 筆** |
| Production Battery Engine/Gateway/Archive Workers | `starry-battery-*-production` | **均已私有暗部署**，無公開路由、無 Cron、未接正式 Auth，交易功能 disabled |
| 中央正式 Worker/D1 | `hglobal-central-id-v2`, `central_id_v2` | 本輪 Battery AI 未修改 |

## 發布與安全隔離
- GitHub Battery 獨立 Draft PR #37：https://github.com/yukidu/Satrry-ID-Center/pull/37。**尚未合併 main**，不得直接把分支未驗收程式部署正式 Workers。
- 新增 `deploy/battery-targets.json`，定義 D1/R2 的正式 UUID／名稱，列出被禁止的中央 D1 UUID。
- 新增 `deploy/verify-battery-cloudflare.mjs` GET-only 預檢與 mock 單元測試；沒有 Cloudflare Secrets 也不會在 GitHub CI 假裝預檢已對真實帳號執行。
- 新增 `starry-battery-production-preflight.yml` 手動唯讀稽核；與 Battery 正式 deploy workflow 共享 `production-starry-battery` 互斥群組。中央獨立使用 `production-central-id`。
- Engine 實際 runtime `BATTERY_OPERATIONS_ENABLED`、`BATTERY_OVERDRAFT_ENABLED`、`BATTERY_CREDIT_ENABLED` 預設未開；Archive `BATTERY_ARCHIVE_ENABLED=false` 且無 Production Cron。普通 release 清理預留仍可執行，但所有新增扣款／透支／贈送不可意外啟用。
- PR 最新 CI 已驗證 Runtime 禁用及只讀 Cloudflare 預檢 Mock。**Production GitHub Environments／私密 Token 的配置和真實 Workflow Dispatch 尚無可驗證執行證據**。

## 已通過的獨立測試（非 Production）
- Cloudflare 隔離 D1 E2E `bat-d1-e2e-overdraft-20261024-05`：14/14 PASS。
- Cloudflare Preview R2 + D1 Archive E2E `bat-r2-archive-e2e-20261024-01`：PASS，sandbox 假會員資料清理驗證 0 筆。
- 新版 runtime 停用開關已加入 GitHub unit tests；這不等於已啟用正式跨 App 扣款。

## 上線阻擋（不得自行勾選）
1. 中央 AI 提供受保護的 Central Auth `CENTRAL_AUTH_VERIFY` Service Binding 與 `POST /v1/introspect`；以真實中央短期 Starry token 做撤銷、停權、刪帳、auth_version E2E。
2. 各 Starry App 分別申請 App Registry/scopes、獨立 Server Key、實際限流，H-Global 全拒絕；手機不得有長效金鑰。
3. 新註冊 X／首次核准 Y／贈送／遷移的可信 Server-to-Server 入帳事件與安全 issuer 權限驗收。
4. Production D1 回復書籤或備份與可回退 migration 演練、交易並行費用監控、刪帳及 R2 隱私清除。
5. PR #37 與中央共享契約 CI 驗收，按 SOP 合併 main 後，才使用 Battery 專屬 Production Workflow 發布。
6. 正式 worker deployment SHA、health、真實合法與非法 token 的讀寫 E2E、回退點與安全稽核證據。

## 發布結論
`production_ready=false`。**正式 D1/R2＋三個私有 Worker 已部署；因沒有正式中央 Auth／正式金鑰／正式授權，Battery API Production 對會員尚未啟用。**

## 第二階段｜Dark Production Workers 實際 Cloudflare 版本與安全查驗（2026-10-24）

| Worker | Cloudflare deploy version_id | Public/Preview | Cron | 安全狀態 |
| --- | --- | --- | --- | --- |
| `starry-battery-engine-production` | `82799615-c8c1-4723-bd22-a2d06096d44b` | 皆 disabled | 0 | 正式 D1 綁定正確；OPERATIONS/CREDIT/OVERDRAFT 全為 `false`，無正式私有 Secret |
| `starry-battery-gateway-production` | `182448c0-e9ef-481c-adf1-1a43de7462d7` | 皆 disabled | 0 | D1／R2 指向 Battery Production，私有 `BATTERY_ENGINE` 指向正式 Battery Engine；缺中央 Auth Binding 會拒絕全部會員 API |
| `starry-battery-archive-production` | `0489956d-c07b-4dfe-becf-94cd34310a76` | 皆 disabled | 0 | 正式 R2、D1 綁定正確，`BATTERY_ARCHIVE_ENABLED=false`，絕無自動移除帳本排程 |

**注意：這是完成正式暗部署，不是完成正式上線。** 雖然程式存在於正式 Cloudflare 帳號，但沒有公開入口、正式 App 客戶端憑證、中央 Auth 綁定和已開啟的財務 runtime 開關，無法讓會員使用。部署來源仍為 Draft PR #37 的候選程式，只有下一階段經過中央與 Battery 雙方驗收、合併 main、正式 rollback/CI Gate 後才能逐步放行。

### 中央 AI 已實際有進度（唯讀查核）
中央獨立 Draft PR #40（https://github.com/yukidu/Satrry-ID-Center/pull/40）已建立受保護私有 Auth 候選 Worker／中央 sandbox D1，11/11 隔離 E2E PASS，但**仍無可用的正式短期 token issuer、正式 D1 migration 或正式 Battery 可用驗證服務**。Battery PR #37 已加入中央額外要求的 `X-Central-Service-Auth` Header，以及 `CENTRAL_AUTH_CALLER_SECRET` 缺失 fail-closed，GitHub CI 通過。不可用中央 Sandbox 處理正式會員身份。

## 私有 Production Service Binding 確認｜Cloudflare 真實 6/6 PASS（2026-10-24）
- 使用全新私有測試 Worker `starry-battery-prod-dark-smoke-private-20261024`（沒有 Workers.dev/public/Preview URL）以 Service Binding 呼叫真正的三個 Production Battery Workers。
- **測試報告只寫入獨立 Battery E2E D1 `starry-battery-overdraft-e2e-20261024`**，不寫正式會員錢包或正式 Production D1。
- `run_id=battery-dark-production-smoke-20261024-01`，**6/6 PASS**：正式 Gateway 健康 200、無中央驗證錢包拒絕 503、Gateway 不提供 Credit Endpoint 404、Engine 未設定扣款 Secret 拒絕 503、Engine 未設定入帳 Secret 拒絕 503、Archive 無公開 Handler 404。
- 已透過 Cloudflare GET 確認上述 Cron 完全停用 `schedules=[]`，試驗 Worker 維持私有。三個正式 Worker 的公開及預覽網址均為 `false`，Engine／Archive Cron 為 0。
- 測試後再次唯讀查 Production D1：wallets/apps/ledger/debts/credits/archives **全部 0**。最新 D1 Time Travel rollback bookmark：`00000002-00000000-0000510e-dcf2a5a31fc178bdc96a3309161b7694`（僅記錄測試當下，實際復原需按正式事故 SOP 驗證並慎防覆寫）。
- Battery Gateway 候選已追上中央私有 PR #40 要求，必填 `X-Central-Service-Auth`（來源 `CENTRAL_AUTH_CALLER_SECRET`，不得洩露），缺中央 binding/Caller Secret 一律 fail closed。中央 PR #40 私有 sandbox 11/11 E2E PASS，但真正用戶 token issuer、中央 Production D1 及兩邊跨 App Auth E2E 尚未正式完成。
- **此測試證明安全的暗部署有效，不代表已可讓會員交易。Production release 狀態仍為 blocked/off。**
