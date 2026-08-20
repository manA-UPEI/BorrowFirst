-- One-shot repairs that server/db/init.js used to re-run on every single boot.
-- They are all convergent, so running them once here is equivalent -- and it stops
-- the app paying for a full-table rewrite on each restart.

-- Loans approved under the pre-handoff-code flow never got a pickup verification
-- step, so they are already in the borrower's hands: promote them to 'active'.
UPDATE notifications
SET status = 'active',
    approved_at = COALESCE(approved_at, created_at),
    picked_up_at = COALESCE(picked_up_at, created_at)
WHERE status = 'approved'
  AND approved_at IS NULL
  AND picked_up_at IS NULL
  AND pickup_code_hash IS NULL
  AND approval_expires_at IS NULL;

-- pickup_meetup_at/return_meetup_at used to be TIMESTAMPTZ, which meant a naive
-- "10:00" entered by a borrower got assigned an absolute UTC instant using whatever
-- timezone Postgres's session happened to be configured with, then re-interpreted
-- through the *viewer's* browser timezone on display -- two independent,
-- uncoordinated conversions that could silently shift the displayed meetup time away
-- from what was actually agreed. ALTER COLUMN TYPE TIMESTAMP (no USING clause) has
-- Postgres do exactly one best-effort conversion, to the current session's timezone,
-- and then drop the timezone marker for good. New rows are unaffected: the column is
-- already TIMESTAMP in 001_baseline.sql.
ALTER TABLE notifications ALTER COLUMN pickup_meetup_at TYPE TIMESTAMP;
ALTER TABLE notifications ALTER COLUMN return_meetup_at TYPE TIMESTAMP;

-- Every user created under the legacy auth flow needs a matching Better Auth
-- "account" row (the credential/password link) so they can keep signing in with
-- their existing password after the migration, without a forced reset. Mirrors what
-- Better Auth's own signUpEmail creates for a new user (see
-- node_modules/better-auth/dist/api/routes/sign-up.mjs).
INSERT INTO account (issuer, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
SELECT 'local:credential', CAST(u.id AS TEXT), 'credential', u.id, u.password, NOW(), NOW()
FROM users u
LEFT JOIN account a ON a."userId" = u.id AND a."providerId" = 'credential'
WHERE a.id IS NULL;

-- Legacy users predate the emailVerified gate and were all implicitly verified.
-- This used to run on every boot, which also force-verified any registration that
-- happened to be mid-OTP when the process restarted; as a one-shot migration it only
-- touches the accounts that actually predate the gate.
UPDATE users SET email_verified = TRUE WHERE email_verified = FALSE;

-- users.rating_count/rating_avg are maintained incrementally by the rating use case
-- (see src/application/ratings/createRating.mts). This is a one-time reconciliation
-- for rows written before that was true.
UPDATE users SET rating_count = 0, rating_avg = 0;

UPDATE users
SET rating_count = summary.rating_count,
    rating_avg = summary.rating_avg
FROM (
  SELECT user_id, COUNT(*) AS rating_count, AVG(rating) AS rating_avg
  FROM ratings
  GROUP BY user_id
) summary
WHERE users.id = summary.user_id;

-- Product image paths were served from /assets/images/ before the static mount moved
-- to /images/, and the drill placeholder was retired in favour of a generic campus
-- one. server/db/init.js still runs the JS-side sanitizer (which needs
-- imageService.resolveProductImageUrl) on every boot; only these two pure-SQL
-- rewrites move here.
-- Standard-SQL SUBSTRING rather than REPLACE: '/assets/images/' is 15 characters,
-- so the tail starts at 16. pg-mem does not implement REPLACE.
UPDATE products
SET "Product_Url" = '/images/' || SUBSTRING("Product_Url" FROM 16)
WHERE "Product_Url" LIKE '/assets/images/%';

UPDATE products
SET "Product_Url" = '/images/campus-placeholder.svg'
WHERE "Product_Url" = '/images/drill.svg';
