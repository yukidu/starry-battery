# Starry Battery — Security Policy

This repository intentionally contains **public source code**, as approved by the project owner.
Public source does **not** grant access to production Batteries, AI compute quotas, D1/R2 storage, payment integrations or Cloudflare Worker secrets.

## Supported deployment states
- `starry-battery-api-sandbox-20261024`: PUBLIC **synthetic-only** API; no D1, R2 or Secrets bindings; no true financial transactions. Responses identify `synthetic:true`.
- `starry-battery-app-sandbox-*`: isolated developer-only QA resources; credentials and synthetic members must be provisioned privately before enabling write tests. A new D1 or mock Auth script is **not** evidence that authenticated full-chain tests passed.
- `starry-battery-*-production`: PRIVATE dark-deployed services. Financial writes, purchased credits, overdrafts and archive automation are disabled pending security acceptance.

## Reporting vulnerabilities
Use GitHub's **Report a vulnerability** / **Private Vulnerability Reporting** or private Security Advisory for this repository where enabled. Do **not** post suspected keys, member details, vulnerabilities or exploitation instructions in public issues.
For high-impact issues involving real battery balances or AI charges, the maintainer must immediately disable Production financial switches, revoke affected App/Worker secrets, preserve non-editable audit evidence, investigate D1/R2 and payment reconciliation, and follow incident/rollback procedures before re-enabling any writer.

## Minimum controls before financial Production
- Branch ruleset on `main`: block direct pushes, require CI and independent review, restrict force pushes/deletions, separate approved Production deployment.
- GitHub public repository must never contain actual environment secrets, credential values, member PII, real payment or D1 exports.
- Distinct credentials and least privilege for **each Starry App**, Central Auth, Engine issuer, Gateway and deployments. No App may directly bind D1 or call credit issuance.
- Central Auth must verify caller, token audience/expiry/revocation, `user_id`, Starry-only eligibility, suspension and App scopes on each request.
- Atomic, idempotent operation reservations; full cancellation refunds; independent credit validation and payment provider webhooks with deduplicated order IDs.
- AI compute costs and two-overdraft benefit require explicit business fraud/financial loss controls and acceptable loss limits; do not silently change approved product policy.
- D1 rollback/backup, R2 retention+deletion, payment reconciliation and monitoring; independent E2E and abuse tests on each deployment SHA.

See `SANDBOX_APP_INTEGRATION.md`, `API_CONTRACT_M06.md` and `deploy/PRODUCTION_RELEASE_STATUS_2026-10-24.md`.
