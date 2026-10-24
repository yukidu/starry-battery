## 2026-10-24｜多 App 私有 Sandbox 最新進度

新的隔離私有驗收服務已建立：`starry-battery-multiapp-auth-preview-20261024`、`starry-battery-multiapp-gateway-preview-20261024`、`starry-battery-multiapp-engine-preview-20261024`。僅使用 `starry-battery-app-sandbox-20261024` D1 的兩名合成會員（25、42）與兩個測試 App（`starry_alpha_qa`、`starry_beta_qa`）；App 原始密鑰與假會員 Token 均未發布。

**真實 Cloudflare E2E 第一輪：9/10 PASS**。兩款 App 使用不同 Key 讀取同一會員錢包、跨會員隔離、跨 App 密鑰冒用阻擋、H-Global 阻擋、會員 Token 偽造阻擋及最小 Scope 均通過。第 10 項「不得扣款」本來預期進到 Engine，實際 Gateway 因測試 App 無扣款 scope 提早安全拒絕；已把測試條件更正為檢查 `scope_forbidden`，**更正後 GitHub CI 通過，但雲端 E2E 第二輪尚未讀回**。不可宣稱真實 E2E 10/10。

使用者可立即把本文件與 `client/server-battery-client.mjs` 提供其他 Starry App 的開發 AI，讓它們先實作伺服器端介面；**公開 Demo** 位址仍為 `https://starry-battery-api-sandbox-20261024.yukidu.workers.dev`。私有實測 App Token 和 Key 不公開發送，需逐 App 審核後透過安全憑證通道交付。正式電池與 AI 計費一律未開放。

# Starry Battery｜30 款 App 接入手冊｜開發 Sandbox v1

**進度：** 這份手冊描述獨立 Sandbox 展示 API 和正式 API 契約的界線。**這不是可用的正式電池金流服務**。

## 一、環境比較（務必分開）
| 環境 | API 身分 | 資料 | 可正式扣款 | 用途 |
|---|---|---|---|---|
| **公開合約 Demo** | 公開、只提供假資料 | 程式內固定的 synthetic 假會員、假餘額與假交易，**沒有 D1／R2／會員身分綁定** | ❌ 永遠不允許 | 讓任何 Starry App 開發者試讀、核對 JSON 格式 |
| **Battery 私有 Preview** | 各款 App 後端 Key + 中央 Sandbox Token | 獨立 Preview D1、R2 | 僅限測試資料且須再通過 Private Auth E2E | 內部 App 串接與寫入測試 |
| **正式 Production** | 各款 App 正式 Key + 中央會員正式 Token | 獨立 Production D1／R2 | **目前不允許** | 待中央 Auth、付款、財務/安全/回退驗收後開通 |

公開 Demo 已部署：**https://starry-battery-api-sandbox-20261024.yukidu.workers.dev**，且沒有任何 D1／R2／Secrets／Service Binding。程式：`sandbox-demo.mjs`。

## 二、Demo API 範例
範例用環境變數 `BATTERY_DEMO_BASE_URL`（已部署，請使用下列測試網址）：

```bash
BATTERY_DEMO_BASE_URL='https://starry-battery-api-sandbox-20261024.yukidu.workers.dev'
curl -i "$BATTERY_DEMO_BASE_URL/health"
curl -i "$BATTERY_DEMO_BASE_URL/v1/battery/wallet"
curl -i "$BATTERY_DEMO_BASE_URL/v1/battery/ledger"
curl -i "$BATTERY_DEMO_BASE_URL/sandbox/capabilities"
```

Demo `GET /v1/battery/wallet` 回傳固定假資料，如：
```json
{"available_units":50,"spendable_units":50,"debt_units":0,"reserved_units":0,"overdraft_remaining":2,"overdraft_in_progress":false,"version":1,"environment":"synthetic_sandbox","synthetic":true,"real_member_data":false,"real_money":false,"can_write":false}
```
## 二之一、完全假的預留／結算／取消 API 格式演練
公開 Demo 額外提供 **僅限 `/sandbox/simulate/*` 路徑**的純回應模擬：
```bash
curl -sS -X POST "$BATTERY_DEMO_BASE_URL/sandbox/simulate/reserve" \
 -H 'Content-Type: application/json' \
 -d '{"operation_id":"sandbox_op_1234","quantity":5}'
curl -sS -X POST "$BATTERY_DEMO_BASE_URL/sandbox/simulate/commit" \
 -H 'Content-Type: application/json' \
 -d '{"operation_id":"sandbox_op_1234"}'
curl -sS -X POST "$BATTERY_DEMO_BASE_URL/sandbox/simulate/release" \
 -H 'Content-Type: application/json' \
 -d '{"operation_id":"sandbox_op_1234"}'
```
回應含 `synthetic:true`、`not_persisted:true`、`no_real_charges:true`。這些是**無狀態、純格式示範**，即使先模擬 commit 再 release，真正錢包也完全不會改變；它們**不驗證**實際財務冪等、付款、庫存一致性或逾時。正式 API 的 `/v1/battery/reserve|commit|release` 在 Demo 主機仍一律回 405。

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
