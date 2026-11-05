-- Better Auth two-factor (authenticator apps and backup codes) and passkey plugins.
ALTER TABLE user ADD COLUMN twoFactorEnabled INTEGER DEFAULT 0;
CREATE TABLE twoFactor (id TEXT PRIMARY KEY, secret TEXT NOT NULL, backupCodes TEXT NOT NULL, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, verified INTEGER DEFAULT 1, failedVerificationCount INTEGER DEFAULT 0, lockedUntil INTEGER);
CREATE INDEX twoFactor_user ON twoFactor(userId);
CREATE INDEX twoFactor_secret ON twoFactor(secret);
CREATE TABLE passkey (id TEXT PRIMARY KEY, name TEXT, publicKey TEXT NOT NULL, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, credentialID TEXT NOT NULL, counter INTEGER NOT NULL, deviceType TEXT NOT NULL, backedUp INTEGER NOT NULL, transports TEXT, createdAt INTEGER, aaguid TEXT);
CREATE INDEX passkey_user ON passkey(userId);
CREATE UNIQUE INDEX passkey_credential ON passkey(credentialID);
