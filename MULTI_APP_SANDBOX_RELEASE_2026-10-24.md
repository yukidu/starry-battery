# Starry Battery｜多 App 私有 Sandbox 實際接入 v1（2026-10-24）

**目標：** 在不啟用付費電池的前提下，供不同 Starry App 的後端團隊測試「每 App 各自的憑證／Scopes、同會員共用錢包、不同會員隔離」。

## 已在 Cloudflare 實際建立
- 隔離資料庫：`starry-battery-app-sandbox-20261024`（**不是正式** `starry-battery-production`）。
- 私有 Sandbox Central 模擬驗證：`starry-battery-multiapp-auth-preview-20261024`；檔案 `sandbox-multiapp-auth.mjs`。
- 私有 Gateway：`starry-battery-multiapp-gateway-preview-20261024`；與獨立 Sandbox D1、私有 Engine、專屬 R2、私有 Sandbox Auth 以 Cloudflare Service Binding 連接。
- 私有 Engine：`starry-battery-multiapp-engine-preview-20261024`。**OPERATIONS／CREDIT／OVERDRAFT 開關全為 false**，不允許實際 AI 扣款、贈送或透支。
- 私有一輪驗收：`starry-battery-multiapp-e2e-private-20261024`；結果只寫另一個獨立 Battery E2E D1，正式資料庫完全不參與。
- 兩個合成 App：`starry_alpha_qa`（`balance:read ledger:read`）、`starry_beta_qa`（只有 `balance:read`），每一個 App 不同隨機高熵後端 Key，Sandbox D1 **只保存 SHA-256 雜湊**。
- 兩名合成會員：`sandbox_member_alpha`／`sandbox_member_beta`；假錢包分別為 25／42。中央 Sandbox Token、App Key、Caller Secret 只在 Cloudflare 私有設定中；**原始 Secret 沒有寫入公開 GitHub 或文件**。

## 適用的接入方式
1. **外部 App 開發 AI**：先使用完全公開、無身分、無真實資料的合成 Demo `https://starry-battery-api-sandbox-20261024.yukidu.workers.dev`，參見 `SANDBOX_APP_INTEGRATION.md`；它的 `/sandbox/simulate/*` 只是格式回應，不是真正扣款。
2. **經授權的 Starry App 後端**：每款 App 先完成核准、獨立 `app_id`、獨立 Server Secret、最小 `scope`，再以非公開安全通道取得 Sandbox 凭證與私有 API 存取路徑。禁止將 Secrets 放進 App Bundle、前端、公開原始碼或 GitHub Issues。
3. **正式會員**：仍不得接入，正式中央 Auth Token/Scope 尚需最終共同驗收；不允許用 Sandbox Token 操作 Production。
4. **正式電池交易**：扣款、贈送、付費購買、透支及 R2 自動封存都維持關閉。

## 私有真實 E2E 測試矩陣
隔離 Sandbox D1、私有 Gateway/Member Auth 會測試：
- App A 使用自己的 Key 取得假會員 Alpha 的餘額 25。
- App B 使用不同 Key 讀同一假會員 Alpha，同樣得 25。
- App A／B 對 Beta 會員取得 42，不會混到 Alpha。
- App B Key 冒充 A、未登記的 H-Global、假會員 Token、空 Token 都被拒。
- `balance:read` 不能當成 `ledger:read`。
- 沒有正式 Engine 授權與 Runtime Flag，所有財務扣款被拒。

## 真正可交付的上線判準
- 每個 App 逐一核准與獨立 Secrets；不能用 Demo 的固定餘額代替真會員。
- 中央正式 Auth（唯一 user_id、Starry grant、已撤銷 Token/停權即失效）通過跨 Repo E2E。
- 金流、免費贈送、過期、退款/拒付與成本限制完成真實且可重現的財務測試。
- GitHub main branch Ruleset、Production Environment 人工核准、最小權限 CI/CD、Cloudflare 監控與復原。
- `rules-catalog.json.production_ready` 維持 false，明確發布後才能改為 true；**禁止因本 Sandbox 功能可用而提前啟用 Production**。

> 這個 Sandbox 的私有測試憑證不會公開發送給使用者或其他 App。新 App 完整接入還需私有憑證核准／交付以及中央真正 Token issuer 的標準介面。
