# Starry Battery｜獨立儲存庫移轉與驗收紀錄

更新日期：2026-10-24（台灣）

## 權威來源
- 新 Repo：<https://github.com/yukidu/starry-battery>，目前 `main` 已具備 Battery 程式、M06 契約、Engine／Gateway／R2／Schema／Migration／tests 與完整獨立 Actions。
- 原 Repo：<https://github.com/yukidu/hglobal-id>；原專責 Draft [PR #37](https://github.com/yukidu/hglobal-id/pull/37)，來源分支 `feat/starry-battery-independent-release-20261024`。
- 原分支快照：`1c75ee8a6bd26f327a9154a4e35f7b3ef06b15a6`；原 Git tree：`273ee061d057aeacbbf12453add72d7968e6dd36`。
- 新 Repo 以 GitHub 連線寫入**來源快照**，**不是直接匯入完整 git subtree commit DAG**。完整舊 `git log` 仍可在原 Repo 與 PR #37 查證，切勿聲稱原始每個 Commit SHA 已保留在新 Repo 中。

## 資料完整性檢查
- 原 `central-id-v2/battery/` 共有 30 個 Git blob。
- 新 Repo 中 **28 個原始 Battery 檔案 SHA 完全相同**，亦即原始內容完整一致。
- 原 `README.md` 已改寫為新 Repo 頂層正式入口，保存跨 Repo 權責、目前安全狀態與原 PR 來源。
- 原 `deploy/bootstrap-standalone-repo.sh` **不再匯入**：該腳本只能對「空白」目的 Repo 做第一次搬遷，現在目的 Repo 已初始化，避免在已遷移 Repo 上錯誤重跑該一次性工具；原檔仍保留在原 Repo/PR #37。
- 新增獨立 `.github/workflows/starry-battery-ci.yml`，以 Repo 根目錄執行 Node 22 與 Python SQLite 測試；另有 `starry-battery-deploy.yml` 與 `starry-battery-production-preflight.yml`，不含舊 `central-id-v2/battery/` 路徑。
- **新 Repo CI 已成功**；PR/Production 仍須履行獨立發行 Gate。

## 注意：Repo 目前 Public
此新 Repo 建立時 GitHub `visibility=public`，不同於原先約定的 Private。
**管理者應立即**在 GitHub Settings → General → Danger Zone → Change repository visibility 將它改為 **Private**。修改前勿提交新秘密、會員資料或未公開業務政策。原 Battery 原始 Repo 本身也是 Public，本次沒有寫入額外的環境變數或機密。

## Cloudflare 資源保留、不做 D1/R2 遷移
已存在的 `starry-battery-production` D1 與 `starry-battery-ledger-production` R2，與 Private Worker（Engine、Gateway、Archive）仍為原位置和原名稱。GitHub 搬遷**不**變更上述 D1 UUID、R2 Objects、Workers、Secrets 或用戶餘額。Battery Production 依舊保持 Dark Deployment：沒有正式中央 Auth 認證時 fail closed，扣款／透支／贈送／封存 flags 都是 disabled。

## 未完成的切換關卡
1. [ ] 使用者把新 GitHub Repo 設為 Private。
2. [x] 新 Repo main 程式碼及獨立 CI 已建立；GitHub CI 正常。
3. [ ] 在新 Repo 分開設定 `battery-preview`／`battery-production` GitHub Environments、受保護的正式審核、最小權限 CLOUDFLARE Token、Battery D1/R2 Vars、私有 Engine/Issuer 和中央 Auth Caller Secrets。
4. [ ] 手動測試從**新 Repo** 發出的 Preview 部署及 Cloudflare read-only preflight；驗證新 Repo SHA、服務綁定／rollbacks，不能讓 Production 被不經驗收的 Preview 操作污染。
5. [ ] 中央 AI 完成 `hglobal-id` 的私有可信短期 Token／`CENTRAL_AUTH_VERIFY`，與 Battery 完成真實 Auth＋App Scope/Revocation 合約 E2E。
6. [ ] 電池正式贈送／負債／R2 封存/刪帳／D1 Time Travel 回復的完整實際驗收。
7. [ ] 正式生產佈署／切換在通過所有安全 Gate 後才開放。
8. [ ] 經中央與 Battery 協調後，以中央 Repo 的**獨立清理 PR** 移除原 Battery 子目錄與舊 Battery workflows。不要先合併舊混合 PR #34 或 Battery Draft PR #37；保留 PR #37 歷史。

## 所有權
- 中央：`yukidu/hglobal-id`，管理 immutable `user_id`、OAuth/Session、中央 D1、中央身份 Private Auth。
- Battery：`yukidu/starry-battery`，管理 Battery Gateway、Engine、D1、R2、商業規則與獨立 CI／部署。
- 約 30 個 Starry App：只能以受保護的服務端身份和有版本的 API 呼叫 Battery；**H-Global App 不使用 Battery**。
