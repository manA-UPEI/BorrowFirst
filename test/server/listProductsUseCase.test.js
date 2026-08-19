const assert = require('node:assert/strict');
const test = require('node:test');

test('list products use case delegates to the product repository', async () => {
  const { createListProducts } = await import('../../dist/src/application/products/listProducts.mjs');
  const products = [{
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
  let calls = 0;
  const repository = {
    listActive: async () => {
      calls += 1;
      return products;
    }
  };

  const result = await createListProducts(repository).execute();

  assert.deepEqual(result, products);
  assert.equal(calls, 1);
});