const { run, get, all, withTransaction } = require('./connection');
const { hashPassword, verifyPassword } = require('../services/passwordService');
const { DEFAULT_PRODUCT_IMAGE, resolveProductImageUrl } = require('../services/imageService');

const DEMO_USER_EMAIL = 'demo@upei.ca';
const DEMO_USER_PASSWORD = 'demo123';
const DEMO_PRODUCTS = [
  [
    'Campus Laptop',
    'Reliable laptop for research, presentations, and study sessions on campus.',
    'Good',
    '/images/laptop.jpeg',
    18
  ],
  [
    'Camping Tent',
    'Four-person waterproof tent with rainfly and stakes.',
    'Good',
    '/images/tent.svg',
    18
  ],
  [
    'Road Bike',
    'Aluminum frame road bike with helmet included.',
    'Fair',
    '/images/bike.svg',
    25
  ]
];

let schemaInitializationPromise = null;

async function createSchema() {
  await run(
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      full_name TEXT NOT NULL DEFAULT '',
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      points INTEGER NOT NULL DEFAULT 0,
      rating_count INTEGER NOT NULL DEFAULT 0,
      rating_avg DOUBLE PRECISION NOT NULL DEFAULT 0
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS products (
      "Product_ID" SERIAL PRIMARY KEY,
      "Product_Name" TEXT NOT NULL,
      "Product_Lender_ID" INTEGER NOT NULL,
      "Product_Borrower_ID" INTEGER NULL,
      "Product_Is_Active" INTEGER NOT NULL DEFAULT 1,
      "Product_Description" TEXT,
      "Product_Condition" TEXT,
      "Product_Url" TEXT,
      "Product_Lending_Charge" INTEGER NOT NULL
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS product_images (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      cloudinary_public_id TEXT,
      image_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      is_cover BOOLEAN NOT NULL DEFAULT FALSE,
      width INTEGER,
      height INTEGER,
      bytes INTEGER,
      mime_type TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS pickup_options (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      option_index INTEGER NOT NULL,
      location TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ratings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      user_email TEXT NOT NULL,
      rater_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      lender_id INTEGER NOT NULL,
      borrower_id INTEGER NOT NULL,
      pickup_option INTEGER NOT NULL,
      pickup_meetup_at TIMESTAMP,
      due_date DATE,
      status TEXT NOT NULL DEFAULT 'pending',
      approved_at TIMESTAMPTZ,
      approval_expires_at TIMESTAMPTZ,
      pickup_code_hash TEXT,
      pickup_code_expires_at TIMESTAMPTZ,
      picked_up_at TIMESTAMPTZ,
      pickup_verified_by_user_id INTEGER,
      return_meetup_at TIMESTAMP,
      return_code_hash TEXT,
      return_code_expires_at TIMESTAMPTZ,
      returned_at TIMESTAMPTZ,
      returned_by_user_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS rate_limits (
      rate_key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      reset_at BIGINT NOT NULL
    )`
  );

  await createBetterAuthSchema();
  await ensureIndexes();
}

// Hand-written to match the table/column shape Better Auth's Kysely adapter expects
// at runtime (confirmed against node_modules/@better-auth/core/src/db/get-tables.ts),
// rather than running Better Auth's own migration CLI: that CLI's schema
// introspection queries pg_catalog with syntax pg-mem (the in-memory fallback this
// app uses for tests and DATABASE_URL-less local dev) does not support, and would
// crash the app on every boot outside of real Postgres. Plain CREATE TABLE IF NOT
// EXISTS, like the rest of this file, works on both.
//
// Better Auth's Kysely queries always double-quote identifiers, which Postgres
// treats as case-sensitive, so every camelCase column below must stay quoted here
// too -- an unquoted CamelCase column name would fold to lowercase and no longer
// match what Better Auth queries for at runtime.
async function createBetterAuthSchema() {
  await run(
    `ALTER TABLE users
       ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
       ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  );

  // Better Auth stores credential passwords on its own "account" row, not on the
  // user row, and never writes users.password when it creates a user. Existing
  // rows keep their legacy hash (still read by cleanupLegacyDemoData), but the
  // column can no longer be required for new rows.
  await run('ALTER TABLE users ALTER COLUMN password DROP NOT NULL');

  // The old express-session store and email/password pending-registration flow
  // are both fully superseded by Better Auth's own session/account/verification
  // tables below; drop them so an existing deployment doesn't carry dead tables.
  await run('DROP TABLE IF EXISTS sessions');
  await run('DROP TABLE IF EXISTS pending_registrations');

  await run(
    `CREATE TABLE IF NOT EXISTS session (
      id SERIAL PRIMARY KEY,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      token TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS account (
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
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS verification (
      id SERIAL PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );

  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_session_token ON session(token)');
  await run('CREATE INDEX IF NOT EXISTS idx_session_user_id ON session("userId")');
  await run(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_account_issuer_account_id ON account(issuer, "accountId")'
  );
  await run('CREATE INDEX IF NOT EXISTS idx_account_user_id ON account("userId")');
  await run('CREATE INDEX IF NOT EXISTS idx_verification_identifier ON verification(identifier)');
}

// One-time backfill: every user created under the legacy auth flow needs a
// matching Better Auth "account" row (the credential/password link) so they can
// keep signing in with their existing password after the migration, without a
// forced reset. Mirrors exactly what Better Auth's own signUpEmail creates for a
// new user (see node_modules/better-auth/dist/api/routes/sign-up.mjs), and is
// safe to run on every boot: existing accounts are left untouched.
async function backfillBetterAuthAccounts() {
  const usersMissingAccount = await all(
    `SELECT u.id, u.password
     FROM users u
     LEFT JOIN account a ON a."userId" = u.id AND a."providerId" = 'credential'
     WHERE a.id IS NULL`
  );

  for (const user of usersMissingAccount) {
    await run(
      `INSERT INTO account (issuer, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       VALUES ('local:credential', ?, 'credential', ?, ?, NOW(), NOW())`,
      [String(user.id), user.id, user.password]
    );
  }

  await run('UPDATE users SET email_verified = TRUE WHERE email_verified = FALSE');
}

// One-time, idempotent: pickup_meetup_at/return_meetup_at used to be
// TIMESTAMPTZ, which meant a naive "10:00" entered by a borrower got assigned
// an absolute UTC instant using whatever timezone Postgres's session happened
// to be configured with, then re-interpreted through the *viewer's* browser
// timezone on display -- two independent, uncoordinated conversions that could
// silently shift the displayed meetup time away from what was actually agreed.
// ALTER COLUMN TYPE TIMESTAMP (no USING clause) has Postgres do exactly one
// best-effort conversion, to the current session's timezone, and then drop the
// timezone marker for good; new rows are unaffected since the column is
// already TIMESTAMP from CREATE TABLE. Safe to run on every boot: once the
// column is TIMESTAMP, this is a no-op.
async function makeMeetupTimestampsTimezoneNaive() {
  await run('ALTER TABLE notifications ALTER COLUMN pickup_meetup_at TYPE TIMESTAMP');
  await run('ALTER TABLE notifications ALTER COLUMN return_meetup_at TYPE TIMESTAMP');
}

async function ensureSchema() {
  if (!schemaInitializationPromise) {
    schemaInitializationPromise = createSchema().catch((error) => {
      schemaInitializationPromise = null;
      throw error;
    });
  }

  await schemaInitializationPromise;
}

async function initializeDatabase() {
  await ensureSchema();
  await makeMeetupTimestampsTimezoneNaive();
  await migrateLegacyLoanStatuses();
  await normalizeProductImagePaths();
  await sanitizeStoredProductImages();
  await cleanupExpiredRateLimits();
  await cleanupLegacyDemoData();
  await syncUserRatingStats();
  await backfillBetterAuthAccounts();
}

async function migrateLegacyLoanStatuses() {
  await run(
    `UPDATE notifications
     SET status = 'active',
         approved_at = COALESCE(approved_at, created_at),
         picked_up_at = COALESCE(picked_up_at, created_at)
     WHERE status = 'approved'
       AND approved_at IS NULL
       AND picked_up_at IS NULL
       AND pickup_code_hash IS NULL
       AND approval_expires_at IS NULL`
  );
}

async function ensureIndexes() {
  await run(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_product_sort_order ON product_images(product_id, sort_order)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_product_images_product_cover ON product_images(product_id, is_cover, sort_order)'
  );
  await run(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_pickup_options_product_option ON pickup_options(product_id, option_index)'
  );
  await run(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_user_rater ON ratings(user_id, rater_id)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_notifications_lender_status ON notifications(lender_id, status, created_at)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_notifications_borrower_status ON notifications(borrower_id, status, created_at)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_notifications_status_approval_expiry ON notifications(status, approval_expires_at)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_products_lender ON products("Product_Lender_ID")'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_products_borrower ON products("Product_Borrower_ID")'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_products_active ON products("Product_Is_Active")'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_ratings_user_created_at ON ratings(user_id, created_at)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits(reset_at)'
  );
}

async function normalizeProductImagePaths() {
  const rows = await all('SELECT "Product_ID", "Product_Url" FROM products');

  for (const row of rows) {
    let nextUrl = row.Product_Url || '';

    if (nextUrl.startsWith('/assets/images/')) {
      nextUrl = nextUrl.replace('/assets/images/', '/images/');
    }

    if (nextUrl === '/images/drill.svg') {
      nextUrl = '/images/campus-placeholder.svg';
    }

    if (nextUrl !== (row.Product_Url || '')) {
      await run(
        'UPDATE products SET "Product_Url" = ? WHERE "Product_ID" = ?',
        [nextUrl, row.Product_ID]
      );
    }
  }
}

async function sanitizeStoredProductImages() {
  const rows = await all('SELECT "Product_ID", "Product_Url" FROM products');

  for (const row of rows) {
    const safeImageUrl = resolveProductImageUrl(row.Product_Url);

    if ((row.Product_Url || '') !== safeImageUrl) {
      await run(
        'UPDATE products SET "Product_Url" = ? WHERE "Product_ID" = ?',
        [safeImageUrl, row.Product_ID]
      );
    }
  }
}

async function deleteDemoUserData(userId) {
  await run(
    'DELETE FROM product_images WHERE product_id IN (SELECT "Product_ID" FROM products WHERE "Product_Lender_ID" = ?)',
    [userId]
  );
  await run(
    'DELETE FROM pickup_options WHERE product_id IN (SELECT "Product_ID" FROM products WHERE "Product_Lender_ID" = ?)',
    [userId]
  );
  await run('DELETE FROM notifications WHERE lender_id = ? OR borrower_id = ?', [userId, userId]);
  await run('DELETE FROM ratings WHERE user_id = ? OR rater_id = ?', [userId, userId]);
  await run('DELETE FROM products WHERE "Product_Lender_ID" = ?', [userId]);
  await run('DELETE FROM users WHERE id = ?', [userId]);
}

async function cleanupLegacyDemoData() {
  const demoUser = await get(
    'SELECT id, username, full_name, password FROM users WHERE email = ?',
    [DEMO_USER_EMAIL]
  );

  if (
    !demoUser
    || demoUser.username !== 'demo'
    || demoUser.full_name !== 'Demo User'
    || !verifyPassword(DEMO_USER_PASSWORD, demoUser.password)
  ) {
    return;
  }

  await withTransaction(async () => {
    await deleteDemoUserData(demoUser.id);
  });
}

async function syncUserRatingStats() {
  await run('UPDATE users SET rating_count = 0, rating_avg = 0');

  const rows = await all(
    'SELECT user_id, COUNT(*) AS count, AVG(rating) AS average FROM ratings GROUP BY user_id'
  );

  for (const row of rows) {
    await run(
      'UPDATE users SET rating_count = ?, rating_avg = ? WHERE id = ?',
      [row.count || 0, row.average || 0, row.user_id]
    );
  }
}

async function cleanupExpiredRateLimits() {
  await run('DELETE FROM rate_limits WHERE reset_at <= ?', [Date.now()]);
}

async function seedDemoData() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seeding is disabled in production.');
  }

  await initializeDatabase();

  await withTransaction(async () => {
    const existingUser = await get('SELECT id FROM users WHERE email = ?', [DEMO_USER_EMAIL]);

    if (existingUser) {
      await deleteDemoUserData(existingUser.id);
    }

    const result = await run(
      `INSERT INTO users (username, full_name, email, password, address, phone, country)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id AS "lastID"`,
      [
        'demo',
        'Demo User',
        DEMO_USER_EMAIL,
        hashPassword(DEMO_USER_PASSWORD),
        '',
        '',
        ''
      ]
    );

    for (const product of DEMO_PRODUCTS) {
      await run(
        `INSERT INTO products (
          "Product_Name",
          "Product_Lender_ID",
          "Product_Borrower_ID",
          "Product_Is_Active",
          "Product_Description",
          "Product_Condition",
          "Product_Url",
          "Product_Lending_Charge"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product[0],
          result.lastID,
          null,
          1,
          product[1],
          product[2],
          resolveProductImageUrl(product[3] || DEFAULT_PRODUCT_IMAGE),
          product[4]
        ]
      );
    }
  });
}

module.exports = initializeDatabase;
module.exports.seedDemoData = seedDemoData;
module.exports.DEMO_USER_EMAIL = DEMO_USER_EMAIL;
