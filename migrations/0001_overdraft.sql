-- Forward-only upgrade for EXISTING isolated Battery D1. Never apply to central member D1.
-- Take D1 native backup first. Run once only after verifying the old Battery schema.
-- Do NOT run after initializing a fresh database with the updated schema.sql.
ALTER TABLE battery_reservations ADD COLUMN funded_units INTEGER NOT NULL DEFAULT 0 CHECK(funded_units >= 0);
ALTER TABLE battery_reservations ADD COLUMN overdraft_units INTEGER NOT NULL DEFAULT 0 CHECK(overdraft_units >= 0);
-- Legacy reservations were entirely FEFO funded; retain ability to release them.
UPDATE battery_reservations SET funded_units=quantity WHERE overdraft_units=0;
CREATE TABLE IF NOT EXISTS battery_overdraft_accounts (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES battery_wallets(user_id),
 debt_units INTEGER NOT NULL DEFAULT 0 CHECK(debt_units BETWEEN 0 AND 9007199254740991),
 successful_uses INTEGER NOT NULL DEFAULT 0 CHECK(successful_uses BETWEEN 0 AND 2),
 active_reservation_id TEXT DEFAULT NULL CHECK(active_reservation_id IS NULL OR length(active_reservation_id) BETWEEN 8 AND 120)
);
CREATE TABLE IF NOT EXISTS battery_credit_receipts (
 credit_id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES battery_wallets(user_id),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 repaid_units INTEGER NOT NULL DEFAULT 0 CHECK(repaid_units>=0),
 lot_units INTEGER NOT NULL DEFAULT 0 CHECK(lot_units>=0),
 created_at_ms INTEGER NOT NULL,
 source TEXT NOT NULL,
 expires_at_ms INTEGER NOT NULL,
 CHECK(repaid_units+lot_units=quantity)
);
CREATE INDEX IF NOT EXISTS idx_battery_credit_receipts_user ON battery_credit_receipts(user_id,created_at_ms);

-- Enforce lot-backed reservation amount plus overdraft shortfall equals charge.
CREATE TRIGGER IF NOT EXISTS battery_reservation_split_insert
BEFORE INSERT ON battery_reservations
WHEN NEW.funded_units + NEW.overdraft_units != NEW.quantity
BEGIN SELECT RAISE(ABORT,'reservation_amount_mismatch'); END;
CREATE TRIGGER IF NOT EXISTS battery_reservation_split_update
BEFORE UPDATE ON battery_reservations
WHEN NEW.funded_units + NEW.overdraft_units != NEW.quantity
BEGIN SELECT RAISE(ABORT,'reservation_amount_mismatch'); END;
