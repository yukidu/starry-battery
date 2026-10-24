# Starry Battery｜繁星電池獨立專案

**Starry 專屬電池服務**，提供 Starry 生態系 App 共用電池餘額、FEFO、預留扣款、成功透支兩次、欠款清償與 R2 歷史封存。**H-Global 不得使用此服務。**

- 中央會員與登入權威 Repo：[yukidu/hglobal-id](https://github.com/yukidu/hglobal-id)
- Battery 來源歷史：[hglobal-id 舊 Battery PR #37](https://github.com/yukidu/hglobal-id/pull/37)
- 程式碼抽取來源：`central-id-v2/battery/`，Branch `feat/starry-battery-independent-release-20261024`。
- 本 Repo 的 GitHub 分拆工作不複製、不重建，也不修改既有 Cloudflare Battery D1、R2 或正式 Worker。

## 重要狀態
- 獨立 Repo 遷移中；所有安全 CI / Cloudflare binding / App 權限必須重新驗收。
- Battery Production 已暗部署但尚未對會員開放：扣款、贈送、透支及自動封存預設禁用；正式身份授權/逐 App 憑證/交易 E2E 尚未全面通過。
- **本儲存庫目前的 GitHub 可見性為 Public**。請至 Settings → General → Danger Zone → Change repository visibility 改為 **Private**，避免未來提交任何未公開的業務規格。不得提交環境金鑰、Token、OAuth Secret 或會員個資。

## 治理
中央 AI 管理 OAuth／Session／中央身份 D1／私有 `POST /v1/introspect`，Starry Battery 管理私有 Gateway／Engine／Battery D1／R2／部署。跨 Repo 只透過版本化契約與授權後端 API 連接。

> 目前首次匯入為**可稽核來源的程式碼快照**，不是 Git commit 歷史直接搬移；完整舊提交紀錄保留於原 Repo/PR #37。來源 SHA 詳 `STANDALONE_MIGRATION.md`。
