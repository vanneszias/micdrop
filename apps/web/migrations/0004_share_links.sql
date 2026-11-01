CREATE TABLE share_links (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('record','invite')), target TEXT NOT NULL, role TEXT, created_by TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0);
CREATE INDEX share_links_target ON share_links(target, kind);
