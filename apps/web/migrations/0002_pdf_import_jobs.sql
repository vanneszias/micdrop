CREATE TABLE pdf_import_jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK(status IN ('running','done','failed')), result TEXT, error TEXT, error_status INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX pdf_import_jobs_user ON pdf_import_jobs(user_id, created_at);
