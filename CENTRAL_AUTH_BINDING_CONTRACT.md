# Battery ↔ 中央會員 Auth｜跨 Worker 私有契約 v1（待中央 AI 實作與共同驗收）

**權責：** Central AI 擁有中央 OAuth／Session／中央 D1／Auth Worker；Battery AI 擁有 Battery Gateway／Engine／Battery D1。本文僅規範跨服務介面，不得直接修改中央會員正式程式或從 Cookie 推算 Starry 授權。

## 入口（僅 Service Binding）
- Cloudflare Gateway binding: `CENTRAL_AUTH_VERIFY` → 中央 AI 授權提供的私有 Auth Worker。建議單獨的 Worker script，無 public routes／workers.dev；正式 service name 須由中央 AI 提供並驗證。
- Gateway 每次請求對 binding 呼叫 `POST https://central-auth.internal/v1/introspect`，JSON body 嚴格 `{"required_brand":"starry"}`；headers 含 `Content-Type: application/json`、`Authorization: Bearer <opaque-access-token>`、`X-Battery-Caller: starry`。
- Token 為受中央後端管理的短期、受限使用權杖，不是 Google ID token、H-Global 網站 Cookie、瀏覽器可見的 App server secret，也不能由 Battery 自己簽發或自報 user_id。
- 中央服務不得只信任 `X-Battery-Caller` 字串；需驗證 token 簽章／DB session、audience／發行來源、期限、撤銷、`auth_version`、中央帳號狀態及品牌 Starry 的有效授權。
- 額外的 Worker 間授權／秘密值應採中央與 Battery 共同驗證的專用機制；公開中央入口不可提供能以任意 token 或 Cookie 查他人身份的開放 introspection。

## 最小成功回應（HTTP 200）
```json
{"active":true,"brand_allowed":true,"user_id":"immutable_central_user_id","suspended":false}
```
必填欄位必須為 **boolean true、boolean true、非空合法中央 user_id、boolean false**；拒絕 `"true"` 字串、空值與可疑 user_id。實際 member user_id 為中央唯一權威，Battery 不依 request payload／Email／手機推導 user_id。HTTP 401/403 表示權杖拒絕；中央服務 5xx／解析錯誤／未設 binding = Battery 503 並 fail closed。

## 授權與一致性
- 中央停權／刪帳／Session 撤銷／auth_version 改變必須立即令新請求拒絕。既有 Battery 透支預留在逾時或明確 release 時退還；不得繼續對被停權會員接受 commit，具體處理須雙方做安全 E2E。
- Gateway 每次餘額、明細、reserve、commit、release 重新查中央授權；所有 App 共用同一 immutable user_id。
- 合約版本重大變更另建跨域 PR，中央與 Battery 均通過契約測試才變更 Binding；不可任一方直接改對方資源。

## 共同驗收矩陣
1. 有效 Starry token → active/brand_allowed/user_id 正確，Gateway 讀本人餘額。
2. 偽造 user_id、任意 H-Global token、Google ID token／Session Cookie → 401/403。
3. revoked、deleted、suspended、expired、auth_version 已升版 → 401/403。
4. 中央 Worker 無法使用、5xx、無效 JSON、缺 binding → 503 並且 Battery D1 不扣款。
5. 同一 user_id 跨兩個已核准 Starry App → 相同 Battery 會員錢包；每會員最多一個進行中透支。
6. Gateway/Engine 私有 Secret 分離；Battery 授信 Secret 與扣款 Secret 不可互通。
7. Central AI 提供測試 Worker、測試 token 與有簽章的 sample response，兩方共同保存 CI/E2E/回退證據。

**現況：** Battery Gateway 目前已按此基本請求格式呼叫，但中央 `/v1/introspect` 尚未驗證正式存在；Cloudflare Battery Preview 故意沒有綁中央正式服務，Production 不開放。
