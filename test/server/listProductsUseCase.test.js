const assert = require('node:assert/strict');
const test = require('node:test');

const PRODUCTS = [{
  id: 7,
  name: 'Projector',
  lenderId: 2,
  borrowerId: null,
  isActive: true,
  description: 'HD projector',
  condition: 'Good',
  imageUrl: '/images/projector.png',
  lendingCharge: 5,
  imageCount: 0,
  currentTransactionStatus: ''
}];

test('list products use case delegates to the product repository', async () => {
  const { createListProducts } = await import('../../dist/src/application/products/listProducts.mjs');
  const page = { items: PRODUCTS, nextCursor: null };
  let calls = 0;
  const repository = {
    listActive: async () => {
      calls += 1;
      return page;
    }
  };

  const result = await createListProducts(repository).execute();

  assert.deepEqual(result, page);
  assert.equal(calls, 1);
});

test('list products use case passes the paging query through untouched', async () => {
  const { createListProducts } = await import('../../dist/src/application/products/listProducts.mjs');
  const query = {
    limit: 10,
    cursor: 'opaque-cursor',
    search: 'projector',
    condition: 'Good',
    maxPrice: 20,
    sort: 'price_asc'
  };
  let received = null;
  const repository = {
    listActive: async (incoming) => {
      received = incoming;
      return { items: PRODUCTS, nextCursor: 'next' };
    }
  };

  const result = await createListProducts(repository).execute(query);

  assert.deepEqual(received, query);
  assert.equal(result.nextCursor, 'next');
});
