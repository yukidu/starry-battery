# Starry Battery｜繁星電池獨立專案

**Starry 專屬電池服務**，提供 Starry 生態系 App 共用電池餘額、FEFO、預留扣款、成功透支兩次、欠款清償與 R2 歷史封存。**H-Global 不得使用此服務。**

- 中央會員與登入權威 Repo：[yukidu/hglobal-id](https://github.com/yukidu/hglobal-id)
- Battery 來源歷史：[hglobal-id 舊 Battery PR #37](https://github.com/yukidu/hglobal-id/pull/37)
- 程式碼抽取來源：`central-id-v2/battery/`，Branch `feat/starry-battery-independent-release-20261024`。
- 本 Repo 的 GitHub 分拆工作不複製、不重建，也不修改既有 Cloudflare Battery D1、R2 或正式 Worker。

## 重要狀態
- 獨立 Repo 遷移中；所有安全 CI / Cloudflare binding / App 權限必須重新驗收。
- Battery Production 已暗部署但尚未對會員開放：扣款、贈送、透支及自動封存預設禁用；正式身份授權/逐 App 憑證/交易 E2E 尚未全面通過。
- **正式決議：本儲存庫維持 GitHub Public（公開原始碼）**；使用者已於 2026-10-24 明確確認，無須改成 Private。公開僅限原始碼及可公開的開發文件，**不得提交** `.env`、任何存取金鑰、GitHub／Cloudflare API Token、OAuth Client Secret、會員個資、正式資料庫匯出或私密憑證；正式環境憑證只能使用 GitHub Actions Secrets／Cloudflare Secrets 及最小權限部署。

## 治理
中央 AI 管理 OAuth／Session／中央身份 D1／私有 `POST /v1/introspect`，Starry Battery 管理私有 Gateway／Engine／Battery D1／R2／部署。跨 Repo 只透過版本化契約與授權後端 API 連接。

> 目前首次匯入為**可稽核來源的程式碼快照**，不是 Git commit 歷史直接搬移；完整舊提交紀錄保留於原 Repo/PR #37。來源 SHA 詳 `STANDALONE_MIGRATION.md`。
