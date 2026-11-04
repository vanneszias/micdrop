-- Better Auth admin plugin. Grant platform administrators by hand: UPDATE user SET role='admin' WHERE email='…';
ALTER TABLE user ADD COLUMN role TEXT;
ALTER TABLE user ADD COLUMN banned INTEGER DEFAULT 0;
ALTER TABLE user ADD COLUMN banReason TEXT;
ALTER TABLE user ADD COLUMN banExpires INTEGER;
ALTER TABLE session ADD COLUMN impersonatedBy TEXT;
-- Every administrator read of private data and every administrator change.
CREATE TABLE admin_actions (id TEXT PRIMARY KEY, admin_id TEXT NOT NULL, action TEXT NOT NULL, target_kind TEXT NOT NULL, target_id TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
CREATE INDEX admin_actions_target ON admin_actions(target_kind, target_id, created_at);
CREATE INDEX admin_actions_created ON admin_actions(created_at);
