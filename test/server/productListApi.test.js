const assert = require('node:assert/strict');
const test = require('node:test');

const {
  apiRequest,
  loginAs,
  resetDatabase,
  seedProduct,
  seedUser,
  startTestServer,
  stopTestServer
} = require('./helpers/httpHarness');
const { run } = require('../../server/db/connection');

let cookie = '';
let lender = null;

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test.beforeEach(async () => {
  await resetDatabase();
  lender = await seedUser({ email: 'lender@upei.ca', username: 'lender' });
  cookie = await loginAs(lender);
});

async function seedCatalog(products) {
  const ids = [];

  for (const product of products) {
    ids.push(await seedProduct({ lenderId: lender.id, ...product }));
  }

  return ids;
}

function listProducts(query = '') {
  return apiRequest(`/api/products${query}`, { cookie });
}

// Follows nextCursor to exhaustion, the way public/js/api.js getAllPages does.
async function collectAllPages(query = '', limit = 2) {
  const separator = query ? '&' : '?';
  const items = [];
  let cursor = null;

  for (let page = 0; page < 25; page += 1) {
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const { payload } = await listProducts(`${query}${separator}limit=${limit}${cursorParam}`);

    items.push(...payload.items);
    cursor = payload.nextCursor;

    if (!cursor) {
      return items;
    }
  }

  throw new Error('nextCursor never terminated');
}

test('the product list requires a session', async () => {
  const { response, payload } = await apiRequest('/api/products');

  assert.equal(response.status, 401);
  assert.deepEqual(payload, { message: 'Unauthorized' });
});

test('the product list returns a page envelope, newest first', async () => {
  await seedCatalog([
    { name: 'First Item', price: 5 },
    { name: 'Second Item', price: 6 },
    { name: 'Third Item', price: 7 }
  ]);

  const { response, payload } = await listProducts();

  assert.equal(response.status, 200);
  assert.equal(payload.nextCursor, null, 'a full result set has no next page');
  assert.deepEqual(
    payload.items.map((item) => item.Product_Name),
    ['Third Item', 'Second Item', 'First Item']
  );
});

test('cursor paging walks every product exactly once', async () => {
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  await seedCatalog(names.map((name, index) => ({ name, price: index + 1 })));

  const paged = await collectAllPages('', 2);

  assert.deepEqual(
    paged.map((item) => item.Product_Name),
    [...names].reverse(),
    'paged traversal must match the unpaged ordering'
  );
  assert.equal(new Set(paged.map((item) => item.Product_ID)).size, names.length);
});

test('price sorts stay stable across page boundaries when prices tie', async () => {
  // Every product costs the same, so only the Product_ID tiebreaker keeps the
  // cursor unambiguous. Without it a page boundary would repeat or skip rows.
  await seedCatalog(
    ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name, price: 10 }))
  );

  const paged = await collectAllPages('?sort=price_asc', 2);

  assert.equal(paged.length, 5);
  assert.equal(new Set(paged.map((item) => item.Product_ID)).size, 5);
});

test('sort=price_asc and price_desc order by lending charge', async () => {
  await seedCatalog([
    { name: 'Cheap', price: 3 },
    { name: 'Mid', price: 12 },
    { name: 'Pricey', price: 30 }
  ]);

  const ascending = await listProducts('?sort=price_asc');
  const descending = await listProducts('?sort=price_desc');

  assert.deepEqual(
    ascending.payload.items.map((item) => item.Product_Name),
    ['Cheap', 'Mid', 'Pricey']
  );
  assert.deepEqual(
    descending.payload.items.map((item) => item.Product_Name),
    ['Pricey', 'Mid', 'Cheap']
  );
});

test('search matches name, description, and condition case-insensitively', async () => {
  await seedCatalog([
    { name: 'Camping Tent', description: 'Waterproof shelter', condition: 'Good' },
    { name: 'Road Bike', description: 'Aluminium frame', condition: 'Fair' },
    { name: 'Laptop', description: 'For presentations', condition: 'Excellent' }
  ]);

  const byName = await listProducts('?q=tent');
  const byDescription = await listProducts('?q=ALUMINIUM');
  const byCondition = await listProducts('?q=excellent');

  assert.deepEqual(byName.payload.items.map((item) => item.Product_Name), ['Camping Tent']);
  assert.deepEqual(byDescription.payload.items.map((item) => item.Product_Name), ['Road Bike']);
  assert.deepEqual(byCondition.payload.items.map((item) => item.Product_Name), ['Laptop']);
});

test('condition and maxPrice narrow the result set', async () => {
  await seedCatalog([
    { name: 'Budget Good', price: 5, condition: 'Good' },
    { name: 'Budget Fair', price: 6, condition: 'Fair' },
    { name: 'Costly Good', price: 40, condition: 'Good' }
  ]);

  const { payload } = await listProducts('?condition=Good&maxPrice=10');

  assert.deepEqual(payload.items.map((item) => item.Product_Name), ['Budget Good']);
});

test('inactive listings are excluded', async () => {
  await seedCatalog([
    { name: 'Live Listing' },
    { name: 'Removed Listing', isActive: 0 }
  ]);

  const { payload } = await listProducts();

  assert.deepEqual(payload.items.map((item) => item.Product_Name), ['Live Listing']);
});

test('limit is clamped and an unparseable cursor falls back to the first page', async () => {
  await seedCatalog(
    Array.from({ length: 5 }, (unused, index) => ({ name: `Item ${index}`, price: index + 1 }))
  );

  const overLimit = await listProducts('?limit=9999');
  const negativeLimit = await listProducts('?limit=-4');
  const garbageCursor = await listProducts('?cursor=not-a-real-cursor');

  assert.equal(overLimit.payload.items.length, 5);
  assert.equal(negativeLimit.payload.items.length, 5);
  assert.deepEqual(
    garbageCursor.payload.items.map((item) => item.Product_Name),
    overLimit.payload.items.map((item) => item.Product_Name)
  );
});

test('a page hydrates cover image, image count, and loan status for every row', async () => {
  const borrower = await seedUser({ email: 'borrower@upei.ca', username: 'borrower' });
  const [withImages, onLoan] = await seedCatalog([
    { name: 'Photographed Item', imageUrl: '/images/tent.svg' },
    { name: 'Loaned Item', imageUrl: '/images/bike.svg', borrowerId: borrower.id }
  ]);

  await run(
    'INSERT INTO product_images (product_id, image_url, sort_order, is_cover) VALUES (?, ?, ?, ?)',
    [withImages, '/images/laptop.jpeg', 0, false]
  );
  await run(
    'INSERT INTO product_images (product_id, image_url, sort_order, is_cover) VALUES (?, ?, ?, ?)',
    [withImages, '/images/campus-placeholder.svg', 1, true]
  );
  await run(
    `INSERT INTO notifications (product_id, lender_id, borrower_id, pickup_option, status, approved_at)
     VALUES (?, ?, ?, ?, 'active', NOW())`,
    [onLoan, lender.id, borrower.id, 1]
  );

  const { payload } = await listProducts();
  const byName = new Map(payload.items.map((item) => [item.Product_Name, item]));

  assert.equal(byName.get('Photographed Item').image_count, 2);
  assert.equal(
    byName.get('Photographed Item').Product_Url,
    '/images/campus-placeholder.svg',
    'the cover image wins over sort order'
  );
  assert.equal(byName.get('Photographed Item').Current_Transaction_Status, '');
  assert.equal(byName.get('Loaned Item').image_count, 0);
  assert.equal(byName.get('Loaned Item').Current_Transaction_Status, 'active');
});
