#!/usr/bin/env python3
"""Verify Starry Battery is isolated and the per-App quota is atomic in SQLite."""
import sqlite3
from pathlib import Path
root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript((root/"schema.sql").read_text())
tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
for name in ["battery_app_clients","battery_app_rate_limits","battery_wallets","battery_lots","battery_reservations","battery_reservation_allocations","battery_ledger"]:
    assert name in tables, name
db.execute("INSERT INTO battery_app_clients (app_id,token_sha256,scopes,created_at_ms) VALUES(?,?,?,?)",
    ("starry_demo", "0"*64, "balance:read", 1))
client = db.execute("SELECT enabled,rate_limit_per_minute FROM battery_app_clients WHERE app_id='starry_demo'").fetchone()
assert client == (0,120), client # fail-closed by default
sql = ("INSERT INTO battery_app_rate_limits(app_id,window_start_ms,request_count) VALUES(?,?,1) "
       "ON CONFLICT(app_id,window_start_ms) DO UPDATE SET request_count=request_count+1 "
       "WHERE request_count<? RETURNING request_count")
for i in range(1,4):
    assert db.execute(sql,("starry_demo",60000,3)).fetchone()[0]==i
assert db.execute(sql,("starry_demo",60000,3)).fetchone() is None
assert db.execute(sql,("starry_demo",120000,3)).fetchone()[0]==1
try:
    db.execute("INSERT INTO battery_app_clients (app_id,token_sha256,scopes,rate_limit_per_minute,created_at_ms) VALUES(?,?,?,?,?)",
        ("starry_invalid","1"*64,"balance:read",0,1))
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("zero quota must be rejected")
print("Starry-only Battery schema + per-App atomic limits passed")
