-- Starry Battery gateway schema. Isolated from central identity D1 and H-Global D1.
-- DO NOT populate app secrets from GitHub. Admin enrollment must provision SHA-256 digests only.
CREATE TABLE IF NOT EXISTS battery_app_clients (
 app_id TEXT PRIMARY KEY NOT NULL,
 token_sha256 TEXT NOT NULL CHECK(length(token_sha256)=64),
 scopes TEXT NOT NULL DEFAULT 'balance:read',
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 rate_limit_per_minute INTEGER NOT NULL DEFAULT 120 CHECK(rate_limit_per_minute BETWEEN 1 AND 10000),
 created_at_ms INTEGER NOT NULL
);
-- Limit is scoped to each trusted Starry App, not a member account. Periodic retention pruning is required.
CREATE TABLE IF NOT EXISTS battery_app_rate_limits (
 app_id TEXT NOT NULL REFERENCES battery_app_clients(app_id),
 window_start_ms INTEGER NOT NULL,
 request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count>=0),
 PRIMARY KEY (app_id,window_start_ms)
);
CREATE INDEX IF NOT EXISTS idx_battery_app_rate_limits_cleanup ON battery_app_rate_limits(window_start_ms);
CREATE TABLE IF NOT EXISTS battery_wallets (
 user_id TEXT PRIMARY KEY NOT NULL,
 available_units INTEGER NOT NULL DEFAULT 0 CHECK(available_units>=0),
 reserved_units INTEGER NOT NULL DEFAULT 0 CHECK(reserved_units>=0),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1)
);
CREATE TABLE IF NOT EXISTS battery_lots (
 lot_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES battery_wallets(user_id),
 source TEXT NOT NULL,
 expires_at_ms INTEGER NOT NULL,
 available_units INTEGER NOT NULL DEFAULT 0 CHECK(available_units>=0),
 reserved_units INTEGER NOT NULL DEFAULT 0 CHECK(reserved_units>=0)
);
CREATE INDEX IF NOT EXISTS idx_battery_lots_fefo ON battery_lots(user_id,expires_at_ms,lot_id);
CREATE INDEX IF NOT EXISTS idx_battery_lots_expiry ON battery_lots(expires_at_ms,lot_id);
CREATE TABLE IF NOT EXISTS battery_reservations (
 reservation_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES battery_wallets(user_id),
 app_id TEXT NOT NULL,
 operation_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('reserved','committed','released','expired')),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 funded_units INTEGER NOT NULL DEFAULT 0 CHECK(funded_units>=0),
 overdraft_units INTEGER NOT NULL DEFAULT 0 CHECK(overdraft_units>=0),
 deadline_at_ms INTEGER NOT NULL,
 UNIQUE(app_id,operation_id)
);
CREATE INDEX IF NOT EXISTS idx_battery_reservations_timeout ON battery_reservations(state,deadline_at_ms);
CREATE TABLE IF NOT EXISTS battery_reservation_allocations (
 reservation_id TEXT NOT NULL REFERENCES battery_reservations(reservation_id),
 lot_id TEXT NOT NULL REFERENCES battery_lots(lot_id),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 PRIMARY KEY(reservation_id,lot_id)
);
CREATE TABLE IF NOT EXISTS battery_ledger (
 entry_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES battery_wallets(user_id),
 app_id TEXT,
 operation_id TEXT,
 quantity_delta INTEGER NOT NULL,
 created_at_ms INTEGER NOT NULL,
 UNIQUE(app_id,operation_id)
);

-- Debt is a separate nonnegative liability; spendable FEFO lots remain nonnegative.
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

-- Private R2 archive lookup and SHA-256 integrity index. No private user data in public routes.
CREATE TABLE IF NOT EXISTS battery_archive_index (
 entry_id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 digest_sha256 TEXT NOT NULL CHECK(length(digest_sha256)=64),
 archived_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_battery_archive_member_time ON battery_archive_index(user_id,created_at_ms DESC,entry_id DESC);
