-- In-app feedback. `context` is a JSON snapshot of where the user was (page, library, app version, device).
CREATE TABLE feedback (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, kind TEXT NOT NULL, message TEXT NOT NULL, context TEXT NOT NULL DEFAULT '{}', resolved_at INTEGER, resolved_by TEXT, created_at INTEGER NOT NULL);
CREATE INDEX feedback_open ON feedback(resolved_at, created_at);
CREATE INDEX feedback_user ON feedback(user_id, created_at);
