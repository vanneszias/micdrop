-- Better Auth rate limits, shared by every Worker isolate.
CREATE TABLE rateLimit (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL, lastRequest INTEGER NOT NULL);
-- Paid work (PDF extraction, page rendering) counted per account, or per IP when signed out.
CREATE TABLE usage_events (subject TEXT NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX usage_events_subject ON usage_events(subject, kind, created_at);
CREATE INDEX usage_events_created ON usage_events(created_at);
