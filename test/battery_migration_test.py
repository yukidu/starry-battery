#!/usr/bin/env python3
"""Real SQLite migration and invariant checks (independent of any Production D1)."""
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:", isolation_level=None)
db.execute("PRAGMA foreign_keys=ON")
db.executescript("""
CREATE TABLE battery_wallets (
 user_id TEXT PRIMARY KEY, available_units INTEGER NOT NULL DEFAULT 0 CHECK(available_units>=0),
 reserved_units INTEGER NOT NULL DEFAULT 0 CHECK(reserved_units>=0), version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE battery_reservations (
 reservation_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES battery_wallets(user_id),
 app_id TEXT NOT NULL, operation_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('reserved','committed','released','expired')),
 quantity INTEGER NOT NULL CHECK(quantity>0), deadline_at_ms INTEGER NOT NULL,
 UNIQUE(app_id,operation_id)
);
INSERT INTO battery_wallets VALUES('member_alpha',0,4,1);
INSERT INTO battery_reservations VALUES('reserve_legacy','member_alpha','starry_app','legacy_operation',
 'reserved',4,123456);
""")
db.executescript((root / "migrations/0001_overdraft.sql").read_text(encoding="utf-8"))
legacy = db.execute("SELECT quantity,funded_units,overdraft_units FROM battery_reservations").fetchone()
assert legacy == (4,4,0), f"legacy reservation not migrated: {legacy}"
db.execute("INSERT INTO battery_overdraft_accounts(user_id) VALUES('member_alpha')")
# Holding the first overdraft task must reject a second concurrent overdraft
stmt = ("UPDATE battery_overdraft_accounts SET active_reservation_id=CASE WHEN "
        "active_reservation_id IS NULL AND successful_uses<2 AND debt_units<=? THEN ? "
        "ELSE '' END WHERE user_id=?")
db.execute(stmt, (9007199254740981, 'first_reservation', 'member_alpha'))
assert db.execute("SELECT active_reservation_id FROM battery_overdraft_accounts").fetchone()[0] == 'first_reservation'
try:
    db.execute(stmt, (9007199254740981, 'second_reservation', 'member_alpha'))
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("concurrent overdraft seat was not rejected")
try:
    db.execute("UPDATE battery_overdraft_accounts SET debt_units=-1")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("negative stored liability allowed")
try:
    db.execute("UPDATE battery_overdraft_accounts SET successful_uses=3")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("third overdraft allowed")
db.execute("INSERT INTO battery_credit_receipts VALUES('grant_12345678','member_alpha',9,4,5,1,'gift',123456)")
try:
    db.execute("INSERT INTO battery_credit_receipts VALUES('grant_12345678','member_alpha',9,4,5,1,'gift',123456)")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("credit replay accepted")
print("PASS: legacy reservation migration, unique overdraft seat, debt/counter limits and credit idempotency")

# Upgrade legacy receipt metadata in a database that already used overdraft v1.
legacy_db = sqlite3.connect(":memory:")
legacy_db.executescript("""
CREATE TABLE battery_credit_receipts (
 credit_id TEXT PRIMARY KEY, user_id TEXT, quantity INTEGER,
 repaid_units INTEGER, lot_units INTEGER, created_at_ms INTEGER
);
INSERT INTO battery_credit_receipts VALUES('credit_old_123','member_alpha',7,2,5,123);
""")
legacy_db.executescript((root / "migrations/0002_credit_receipt_metadata.sql").read_text(encoding="utf-8"))
record = legacy_db.execute("SELECT source,expires_at_ms FROM battery_credit_receipts WHERE credit_id='credit_old_123'").fetchone()
assert record == ("legacy_unverified",0), record
print("PASS: legacy receipt v2 upgrade retains historical entries with unverified tags")
