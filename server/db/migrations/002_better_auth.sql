-- Better Auth tables, hand-written to match the table/column shape Better Auth's
-- Kysely adapter expects at runtime (confirmed against
-- node_modules/@better-auth/core/src/db/get-tables.ts), rather than running Better
-- Auth's own migration CLI: that CLI's schema introspection queries pg_catalog with
-- syntax pg-mem (the in-memory fallback this app uses for tests and DATABASE_URL-less
-- local dev) does not support, and would crash the app on every boot outside of real
-- Postgres.
--
-- Better Auth's Kysely queries always double-quote identifiers, which Postgres treats
-- as case-sensitive, so every camelCase column below must stay quoted here too -- an
-- unquoted CamelCase column name would fold to lowercase and no longer match what
-- Better Auth queries for at runtime.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Better Auth stores credential passwords on its own "account" row, not on the user
-- row, and never writes users.password when it creates a user. Existing rows keep
-- their legacy hash (still read by cleanupLegacyDemoData), but the column can no
-- longer be required for new rows.
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

-- The old express-session store and email/password pending-registration flow are both
-- fully superseded by Better Auth's own session/account/verification tables below;
-- drop them so an existing deployment doesn't carry dead tables.
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS pending_registrations;

CREATE TABLE IF NOT EXISTS session (
  id SERIAL PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
  id SERIAL PRIMARY KEY,
  issuer TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification (
  id SERIAL PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_token ON session(token);
CREATE INDEX IF NOT EXISTS idx_session_user_id ON session("userId");
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_issuer_account_id ON account(issuer, "accountId");
CREATE INDEX IF NOT EXISTS idx_account_user_id ON account("userId");
CREATE INDEX IF NOT EXISTS idx_verification_identifier ON verification(identifier);
