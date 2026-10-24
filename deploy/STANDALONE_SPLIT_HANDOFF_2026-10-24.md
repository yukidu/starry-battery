# Starry Battery｜獨立 GitHub 儲存庫拆分計畫與中央 AI 交接（2026-10-24）

## 最新決議（使用者已同意）
- 原 GitHub：`https://github.com/yukidu/hglobal-id`，保留中央會員服務、登入、個資及跨 App 授權。
- 新 GitHub（**指定正式名稱**）：`https://github.com/yukidu/starry-battery`，獨立擁有 Battery Engine、Gateway、D1 schema、migrations、R2 封存、Battery CI、Battery deployment。
- 兩邊仍共用 **中央唯一 user_id**，但實際 Battery 餘額、交易與封存繼續用已隔離 Cloudflare Battery D1／R2；H-Global App 不使用電池。
- 未來 30 個 App 原則上各自 Repo，僅透過授權後端 API 接入中央身份與電池服務；多 App 共用程式須以版本化共用 SDK／API 契約處理。
- **新 Repo 的建立是 GitHub 操作，不是移轉 Cloudflare D1/R2。** 不可刪除重建、生產 DB 清空、更新會員餘額或切換正式路由。
- 新 Repo 未建立及完成移轉／測試以前，舊 Battery Draft PR #37 保留為歷史來源，不合併 #37 或混合 PR #34。

## 可驗證移轉來源
- 原 Repo `yukidu/hglobal-id`
- 原分支 `feat/starry-battery-independent-release-20261024`
- 原 Battery 目錄 `central-id-v2/battery/`
- 原 Battery CI `.github/workflows/starry-battery-isolation.yml`
- 原 Battery deploy `.github/workflows/starry-battery-deploy.yml`
- 原 Battery production preflight `.github/workflows/starry-battery-production-preflight.yml`
- 保留中央自身的 `central-id-v2/src/`、`central-id-v2/migrations/`、中央 CI／OAuth／Sessions，不搬中央身份會員程式到新 Repo。
- 移轉工具：`central-id-v2/battery/deploy/bootstrap-standalone-repo.sh`；由 `git subtree split` 抽出 Battery 子目錄歷史，並建立 root-based GitHub Actions。
- **最新使用者正式決議：新 Repo 採 Public（公開原始碼）**，不需要改為 Private。`yukidu/starry-battery` 已建立並已有 Battery 程式及獨立 GitHub CI；初期『建議 Private／尚待建立』已過時。公開原始碼不代表公開 Cloudflare 內部 Worker、D1／R2 會員資料、API Token、Issuer/Caller Secrets 或受保護的部署憑證。

## 新 Repo 預計目錄
```text
starry-battery/
  engine.mjs
  worker.mjs
  archive.mjs
  schema.sql
  rules-catalog.json
  migrations/
  test/
  deploy/
  .github/workflows/starry-battery-ci.yml
  .github/workflows/starry-battery-deploy.yml
  .github/workflows/starry-battery-production-preflight.yml
  README.md
  STANDALONE_MIGRATION.md
```

## 兩個 Repo 所有權的具體約束
1. **中央 AI：** 只管理 `yukidu/hglobal-id` 的中央會員身分、OAuth/Session、Profile、Central D1、中央部署與中央私人 Auth 契約。
2. **Battery AI：** 只管理 `yukidu/starry-battery` 的 FEFO、電池餘額／負債兩次、credits、R2、Battery D1 及自動部署。
3. 中央 AI 在新 Repo Cutover 前 **不得刪除** 舊 `central-id-v2/battery/`，也不得混合 PR #34 或單純合併舊 #37。
4. 新 Repo 預設 GitHub Actions 與 CI 路徑要由 `central-id-v2/battery/` 改成 Repo 根目錄；取消舊 CI 的「禁止改非 Battery 目錄」判斷，但不降低 unit/SQLite/E2E Gate。
5. 以 **跨 Repo 版本化契約** 溝通 `CENTRAL_AUTH_VERIFY` 私有 Service Binding、`POST /v1/introspect`、`X-Central-Service-Auth`、中央 immutable user_id、品牌 Starry grant、Session 撤銷／停權及短期 Token 發放。變更 breaking API 前須兩邊契約測試與明確發版。
6. GitHub Actions secrets/vars/environments 需在新 Repo 個別設定：`BATTERY_D1_DATABASE_ID`、`BATTERY_D1_NAME`、`BATTERY_R2_BUCKET`、`CLOUDFLARE_API_TOKEN_BATTERY`、`CLOUDFLARE_ACCOUNT_ID`、`BATTERY_ENGINE_SECRET`、`BATTERY_CREDIT_ISSUER_SECRET`、`CENTRAL_AUTH_WORKER`、`CENTRAL_AUTH_CALLER_SECRET`；金鑰不可寫入 Git。實際 Secret 配置依 CI 最終需求審核最小權限。
7. **GitHub Release Cutover ≠ 啟用正式扣款**。目前正式 Battery Worker 已私有 Dark Deploy；Production 的扣款、透支、贈送和 Archive 都關閉，未完成中央 Auth/App 金鑰及真實交易整合驗收以前繼續保持關閉。
8. Cloudflare 原有 Battery Preview/Production Workers、D1、R2 的名稱/UUID 與正式資料一律保留；搬移程式管理權，而非複製實際會員資料庫。
9. 新 Repo 的 main 與 CI 成功、中央跨 Repo Auth E2E 及 Preview 成功，GitHub Actions 獨立 Preview/Production 治理與回退驗收都完成後，才做舊 Repo Battery 遺留目錄的**獨立清理 PR**；任何刪除都不可連帶移除中央 Auth Binding 契約或修改中央 D1。
10. 更新 M04/M06/M06-A/M08/M09/99 等正式 Google 文件，將 Battery 的程式碼權威來源換成 `yukidu/starry-battery`，保留舊 Repo/PR #37 為歷史來源而非現行唯一來源；完成前標註「遷移中」。

## 目前實際完成狀態（按證據分類）
- [x] 使用者明確同意分 Repo，指定名稱 `starry-battery`。
- [x] 在舊 Battery 專責分支提交可保留 subtree commit lineage 的安全匯出工具。
- [x] GitHub 獨立 Repo `yukidu/starry-battery` 已建立，使用者確認為 **Public**。
- [ ] Battery 程式與 Git 歷史已推送到新 Repo 的 main。
- [x] 新 Repo GitHub App 已可讀取，獨立 CI 已通過（例如 run `40080523026`）；新 Repo 進一步 Preview／正式部署來源切換仍需驗收。
- [ ] 新 Repo Preview Worker 發布源已更新與跨 Repo Auth E2E。
- [ ] 新 Repo Production Gate／回退、正式可信 Apps 接入驗收。
- [ ] 舊 `hglobal-id` Battery 目錄移除／舊 PR #37 封存（直到新 Repo 驗收，絕不可提前操作）。

**生產狀態：** 即使已完成 Dark Production Worker 部署，Battery 的正式會員扣款仍關閉。
