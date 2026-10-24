# 中央會員 ID × Starry Battery｜平行開發與獨立部署協議

狀態：**發布隔離規則已建檔；CI／Cloudflare 資源配置及實際獨立部署尚待驗證**。2026-10-24。

## 擁有權與修改邊界
- 中央會員團隊：中央 OAuth、Session、中央 user_id、資格／職務、中央 D1、中央 Worker。Battery 團隊不得改中央 D1、中央正式 Worker、中央登入程式。
- Starry Battery 團隊：`central-id-v2/battery/**`（Gateway、私有 Engine、Battery 專屬 D1 migration、測試、文件）、獨立 Battery Workers／R2。中央團隊不得在 Battery 專責 PR 直接修改該目錄。
- 跨域變更（中央 Auth 驗證契約、共用 workflow／wrangler 設定、GitHub 根目錄）必須另外提出相容性 PR，雙方核對後才可合併。

## GitHub
- 兩團隊均從 main 各自建立 feature branch 和獨立 PR；**不得再共同推送既有混合 Draft PR #34**。
- #34 既有中央與 Battery 變更暫保留供審核；不要直接合併，先盤點並將兩個範圍的變更分拆成獨立 PR。禁止 cherry-pick 整包混合 commit 而不審查。
- CI 應按 path 分流，中央及 Battery 分別跑單元、契約、隔離 D1 E2E；共享檔變更兩套測試都要跑。
- 各 PR 通過相應檢查與 Preview 後，按最新 main 重新驗證再合併。合併是序列化操作，但各自 build/deploy 可平行進行。

## Cloudflare 資源隔離
- 中央與 Battery 使用**不同 Worker script 名稱、routes／workers.dev Preview、D1 database_id、R2 bucket、Secrets、Service Binding 權限與部署環境**；絕不共用同一 D1 或把私有 Engine 暴露為公開 Worker。
- 每個 deploy workflow 只能部署自己服務的 Wrangler 配置與 migration；禁止廣泛的 `wrangler deploy` 未指定環境／名稱、全帳號刪除或跨服務 schema 變更。
- 建議 GitHub Actions environment + concurrency group：`production-central-id`、`production-starry-battery`，**不同服務可同時部署，同一服務須序列化**；production secrets 依環境分離，部署憑證採最小權限。
- 中央先發布向後相容的 Auth introspection 契約；Battery 再以受保護 service binding 接入。任一契約不相容即 fail closed，禁止在正式環境冒險啟用。

## 發布 Gate
1. branch → 獨立 PR → 獨立 Preview → CI + 實際隔離 D1 E2E → Auth 契約驗證。
2. 對照當前 main，確認不修改另一團隊檔案及 Cloudflare 綁定；確認 migration 可回復或備有回退方案。
3. 合併 main 後僅觸發相應服務 Production workflow；檢查健康、權限、交易、記錄 SHA／部署 ID／回退點。
4. Starry Battery **負數兩次規則仍未實作、未完成 E2E、未上線**；不因本協議而啟用負數扣款。

## 落地待辦（尚未完成）
- 驗證實際 Cloudflare 中央與 Battery Workers／D1／R2／Service Binding 名稱及隔離。
- 建立或修改 path-filtered CI、獨立 deployment workflow、環境 secrets 和 GitHub 保護規則。
- 分拆 Draft PR #34 的 Battery 程式，避免把中央功能夾帶上線。
- 用兩條獨立 Preview 同時部署並完成不互相覆蓋的驗收。
