const { run, get, all, withTransaction } = require('./connection');
const runMigrations = require('./migrate');
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

// Schema and one-shot data repairs live in server/db/migrations and are applied
// once, in order, by the runner. What remains here is the per-boot maintenance
// that genuinely has to re-run, plus the pieces that need JavaScript helpers and
// so cannot be expressed as a migration.
async function initializeDatabase() {
  await runMigrations();
  await sanitizeStoredProductImages();
  await cleanupExpiredRateLimits();
  await cleanupLegacyDemoData();
}

// Needs imageService.resolveProductImageUrl (allow-list checks that are not
// expressible in SQL), so this stays a boot-time convergence pass rather than a
// migration.
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
  await run('DELETE FROM account WHERE "userId" = ?', [userId]);
  await run('DELETE FROM session WHERE "userId" = ?', [userId]);
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
