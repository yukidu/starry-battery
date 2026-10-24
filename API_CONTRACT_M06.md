## Highest-priority official decision — 2026-10-24 (overrides all older drafts)
**Starry Battery is permanently FREE and can NEVER be purchased, topped up, exchanged for paid subscriptions, or minted by any payment, Apple/Google IAP or external checkout.** Payment status/receipt/provider events must never trigger `POST /v1/credit`. This is a permanent business prohibition, **not** a feature deferred until launch. Only specifically approved, audited, non-commercial **free** grant sources may use the private credit issuer (e.g. free gifts, eligible grants and legacy free claims); all paid or unknown `source` values are fail-closed by the Engine. H-Global does not use Battery.

The user does **not** want pre-release Preview/Sandbox URLs shown or manual preview-site sign-off. Engineering CI, Sandbox/D1 isolation, security testing, protected PR/main and production rollback remain mandatory internally. After all legitimate release gates pass, proceed directly with **Production** and report only verified live results; do not falsely claim readiness.

# Starry Battery API Contract — draft v0.1 (M06 alignment)

Status: **development contract; NOT production-ready**. Authority: M06 latest Google Doc, 2026-10-24. Scope: Starry ecosystem only; H-Global MUST NOT bind, display, or use Battery API.

## Architecture and trust boundaries
Starry App backend → authenticated Battery Gateway → private Battery Engine → dedicated Battery D1; older ledger history archived in Starry R2. A central identity service verifies immutable user_id and Starry access. No App has D1 credentials; no long-lived secret in mobile code. Per-App identity, enabled flag, scopes, quotas, audit logs, separate preview/production credentials and databases. Fail closed if central auth or private engine unavailable.

## Versioned operations (existing Gateway route names must be preserved until verified)
- balance:read — authenticated user's shared available balance.
- ledger:read — authenticated user's paginated cross-App transaction history (including archived history after R2 implementation).
- usage:reserve — atomic FEFO allocation from unexpired lots; app_id + operation_id scoped idempotency; default timeout 180 seconds unless formally configured.
- usage:commit — only a live reservation can become a charge, exactly once. Expired/released reservations never charge even on late success.
- usage:release — failure/cancel/timeout returns **all** reserved units, exactly once. Expired source lots must not be resurrected.
- grant/adjust — privileged, separately approved and audited; never a general App scope.

## Contract invariants
1. User identity and App identity are server-verified; caller-provided user_id/app_id cannot override trusted identity.
2. No partial charge on failed or timed-out AI task; FEFO and atomicity across lot, reservation, wallet and ledger.
3. Normal lot expiry: end of issue month two years later by default. Expiry notices three months before expiry via deduplicated supported channels.
4. Signup X=10 and first central approval Y=20 are **initial planning values**, not enabled policy until checked against current admin settings and 01/02; each eligible new event at most once; no backfill for existing users.
5. Legacy balance claim is one-time, trusted, idempotent; no replay of old transactions. Deleted accounts lose unspent gifted units per formal policy. Purchasing is permanently forbidden (including future IAP, web checkout, top-ups, subscriptions, or any payment-to-battery conversion).
6. Keep most recent year of detailed ledger in D1; reconcile then archive older history in Starry R2 while preserving queryability. R2 archive is not a new central D1 backup.
7. Preview and Production credentials, D1 and bindings are isolated. Versioning must be additive; breaking changes require opt-in version, App-by-App compatibility tests and rollback.

## Approved overdraft contract — implementation candidate, Production disabled
The product decision is now explicit: two **successful** AI usage debits with insufficient balance (not two debt cycles), shared across every Starry App for the same central user_id; at most one active overdraft task per member; commit consumes an opportunity; release, failed work and 180-second timeout consume none. Subsequent grants/credits repay debt first, then create eligible positive lots. Immediately after the debt is completely repaid, restore two overdraft opportunities. No business cap per overdraft operation, but integer-safe numeric range, auth and anti-abuse controls remain mandatory. This branch stores debt separately in `battery_overdraft_accounts` while preserving nonnegative lot CHECKs. `applyCredit` is internal and currently not wired to production grants. **No Production overdraft launch until real D1 E2E and Auth/credit integrations are accepted.**

## Required release gates (NOT satisfied by this document)
- Compare this contract to actual Gateway routes and JSON payloads before treating it as machine-enforced OpenAPI; publish an explicit OpenAPI schema and conformance tests.
- Validate Engine against real isolated Cloudflare D1 concurrent E2E, timeout races, rollback and idempotency.
- Implement/verify one-time grants and claims, R2 archive/history, expiration reminders, admin audit and revocation.
- Verify real central OAuth/introspection and provision per-App credentials securely; run each Starry App contract test and list upgrades.
- Check CI, sandbox Worker bindings, D1 migrations, health monitoring and rollback. User acceptance before production merge/deploy.

Implementation tracking: isolated Battery Draft PR #37 (ported from mixed PR #34), Issue #35. This file is a safe initial contract baseline only, **not evidence of completed Engine/Schema/API changes or deployment**.

## 2026-10-24｜Preview 交易明細封存及私有入帳候選契約（未正式上線）
- `GET /v1/battery/ledger` 必須先取得 App `ledger:read` + 中央 Starry 身分驗證；無私有 `BATTERY_ARCHIVE_R2` Binding 時 fail closed 503。新支援 `before_ms` + `before_id` 游標，最多 50 筆，以可信任 user_id 合併 D1 與 R2；R2 物件讀回以 SHA-256 與 owner/entry_id 一致性驗證，缺物件／校驗不符返回 503，不隱瞞歷史資料損毀。
- 唯一私有發放入口位於**非公開 Engine** `POST /v1/credit`，需要專用 `BATTERY_CREDIT_ISSUER_SECRET`，普通 Gateway Engine Secret 不可授權。需 `credit_id,user_id,source,quantity,expires_at_ms`；只有合法中央管理／註冊／核准／遷入服務才可持有金鑰，普通 Starry App 及瀏覽器不可使用。信用發放先抵債，剩餘再入有效 FEFO lot；同一 credit_id 改變數量、會員、來源或到期日即衝突拒絕。
- R2/D1 真實獨立 E2E run `bat-r2-archive-e2e-20261024-01` PASS，且 sandbox fake records 清理完成；D1 14/14 run `bat-d1-e2e-overdraft-20261024-05` PASS。正式 archive 預設禁用，正式 Production 仍需中央驗證、逐 App auth、可信發放事件、刪帳隱私與 migration/rollback。

## Free credit issuer (2026-10-24 permanent policy)
The Engine now uses a reviewed `FREE_CREDIT_SOURCES` allowlist. Its private credit endpoint never accepts source labels for purchase, IAP, external payment, recharge, top-up, subscription, checkout or other unapproved grants; even a valid issuer secret cannot override this validation. Every future **free** event source requires an explicit code and policy review. The central AI may build payment services for other H-Global/Starry goods, but their financial events have **no Battery issuer rights**.
