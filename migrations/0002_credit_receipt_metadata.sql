-- Apply exactly once to isolated Battery databases that already use the first overdraft schema.
-- DO NOT apply to a freshly initialized schema.sql database (it already has both fields).
-- Fail closed on unknown legacy credit receipts: all prior receipts must be audited before migration.
ALTER TABLE battery_credit_receipts ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy_unverified';
ALTER TABLE battery_credit_receipts ADD COLUMN expires_at_ms INTEGER NOT NULL DEFAULT 0;
-- Existing receipts cannot be trusted as new credits without explicit reconciliation;
-- their canonical operation_id still blocks duplicate credit_id replay.
