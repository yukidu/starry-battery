# Starry Battery｜30 款 App 接入手冊｜開發 Sandbox v1

**進度：** 這份手冊描述獨立 Sandbox 展示 API 和正式 API 契約的界線。**這不是可用的正式電池金流服務**。

## 一、環境比較（務必分開）
| 環境 | API 身分 | 資料 | 可正式扣款 | 用途 |
|---|---|---|---|---|
| **公開合約 Demo** | 公開、只提供假資料 | 程式內固定的 synthetic 假會員、假餘額與假交易，**沒有 D1／R2／會員身分綁定** | ❌ 永遠不允許 | 讓任何 Starry App 開發者試讀、核對 JSON 格式 |
| **Battery 私有 Preview** | 各款 App 後端 Key + 中央 Sandbox Token | 獨立 Preview D1、R2 | 僅限測試資料且須再通過 Private Auth E2E | 內部 App 串接與寫入測試 |
| **正式 Production** | 各款 App 正式 Key + 中央會員正式 Token | 獨立 Production D1／R2 | **目前不允許** | 待中央 Auth、付款、財務/安全/回退驗收後開通 |

公開 Demo 會在正式 Sandbox URL 啟用後提供具體網址。程式：`sandbox-demo.mjs`。

## 二、Demo API 範例
範例用環境變數 `BATTERY_DEMO_BASE_URL`（只有已實際部署後才填正式 URL）：

```bash
curl -i "$BATTERY_DEMO_BASE_URL/health"
curl -i "$BATTERY_DEMO_BASE_URL/v1/battery/wallet"
curl -i "$BATTERY_DEMO_BASE_URL/v1/battery/ledger"
curl -i "$BATTERY_DEMO_BASE_URL/sandbox/capabilities"
```

Demo `GET /v1/battery/wallet` 回傳固定假資料，如：
```json
{"available_units":50,"spendable_units":50,"debt_units":0,"reserved_units":0,"overdraft_remaining":2,"overdraft_in_progress":false,"version":1,"environment":"synthetic_sandbox","synthetic":true,"real_member_data":false,"real_money":false,"can_write":false}
```
**切勿**把這個固定數字當成真實會員電池；它不會根據登入會員改變。Demo 會拒絕 `Authorization`、`X-Central-Access-Token`、`Cookie`，避免誤將正式金鑰送至公開展示站。所有 `POST /v1/battery/*` 直接回 `405 demo_write_disabled`，絕不進行扣款或贈送。

## 三、真實 Battery API（目前不可正式使用）
| 操作 | Route | 所需 App Scope |
|---|---|---|
| 餘額 | GET `/v1/battery/wallet` | `balance:read` |
| 交易紀錄 | GET `/v1/battery/ledger` | `ledger:read` |
| 預留電池 | POST `/v1/battery/reserve` | `usage:reserve` |
| AI 任務成功結算 | POST `/v1/battery/commit` | `usage:commit` |
| AI 失敗、逾時或取消退還 | POST `/v1/battery/release` | `usage:release` |

每個 App **只有自己的後端**可保存 `BATTERY_APP_KEY`；App 手機端／瀏覽器不得保存。每次都由自己的後端提供：
- `X-Battery-App-Id`: 經正式／Preview 登記的 App ID。
- `Authorization: Bearer <private-app-server-key>`: 每 App 一組，存取權限與限流獨立。
- `X-Central-Access-Token`: 由中央會員可靠登入系統簽發的短期會員憑證，不能自己設定 user_id。
- `Content-Type: application/json`（寫入時）。

採用 `client/server-battery-client.mjs` 作為**伺服器端範例 SDK**：
```js
import {StarryBatteryClient} from "./client/server-battery-client.mjs";
const battery=new StarryBatteryClient({
  baseUrl:process.env.BATTERY_API_BASE_URL,
  appId:process.env.BATTERY_APP_ID,
  appKey:process.env.BATTERY_APP_KEY
});
const centralToken=await getVerifiedCentralTokenFromYourServerSession(); // App 必須自行串中央登入
const current=await battery.wallet(centralToken);
const reservation=await battery.reserve(centralToken,{operationId:"operation_00001234",quantity:2});
try{
  await performAlreadyAuthorizedAiTask(); // App 自己限制最大 AI 成本、Token、執行時間
  await battery.commit(centralToken,{operationId:"operation_00001234"});
}catch(error){
  await battery.release(centralToken,{operationId:"operation_00001234"});
  throw error;
}
```
`getVerifiedCentralTokenFromYourServerSession` 與 `performAlreadyAuthorizedAiTask` 是示意占位函式，**並非 Repo 已實作的方法**。應先檢查 token、App 授權與使用者同意、AI 費用硬限制；即使 commit 失敗也不能自動聲稱免費或成功。按確定的 AI 任務交易 ID 做去重，網路失敗不要自動重試成多次扣款。

## 四、30 App 接入前必備的安全 Gate
1. 各款 Starry App 自己的後端與 `app_id`，逐 App 分配最小 scope、短期 Token、獨立撤銷／限流；**H-Global App 不可接入**。
2. App 後端不能直接查 D1／R2，普通 App 不具備電池贈送、入帳或管理員發放權限。
3. 中央私有 `POST /v1/introspect` 已正式部署驗證，含停權、撤銷與 Starry 品牌授權。
4. 本 Repo `main` 啟用保護規則、正式部署環境核准及 Secrets 審查。
5. Preview 使用合成假會員進行完整 App→Gateway→Central Sandbox Auth→Engine→Preview D1 E2E。
6. AI 推論前由後端限制模型、Token、作業次數與最高成本；惡意呼叫與透支須限流警報。
7. 買電池必須先完成金流的伺服器端付款驗證、不可重播的訂單 ID、退款與拒付對帳；目前 `rules-catalog.json.production_ready=false`，付款功能仍停用。
8. Cloudflare Production 的扣款、贈送、透支、R2 自動封存一律不得因 Demo 上線而打開。

## 五、開發者驗收
公開 Demo：
- `GET /health` 應為 200 與 `synthetic:true`。
- `GET /v1/battery/wallet` / `ledger` 應固定假資料、無任何會員身分資訊。
- 對 Demo 傳真的 Token/Cookie，應被 400 拒絕。
- 對 Demo 寫入電池，應被 405 拒絕，正式 D1 不得增加任何一筆資料。

Demo 能讓前端及各 App 開發工作持續，不代表已完成私有 App Key、正式中央 Auth 或金流 API 發行。
