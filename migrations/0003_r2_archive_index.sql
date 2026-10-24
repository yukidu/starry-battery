-- Existing isolated Battery D1 only; creates non-destructive history index.

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
