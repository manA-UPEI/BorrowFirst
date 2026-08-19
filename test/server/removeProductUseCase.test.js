const assert = require('node:assert/strict');
const test = require('node:test');

test('remove product use case rejects removal of another lender product', async () => {
  const { createRemoveProductUseCase } = await import('../../dist/src/application/products/removeProduct.mjs');
  const removeProduct = createRemoveProductUseCase({
    findById: async () => ({ lenderId: 5, borrowerId: null, isActive: true })
  }, {}, {});

  await assert.rejects(() => removeProduct.execute(4, 6), {
    message: 'Not allowed',
    statusCode: 403
  });
});