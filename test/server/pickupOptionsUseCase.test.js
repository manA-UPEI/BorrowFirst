const assert = require('node:assert/strict');
const test = require('node:test');

test('pickup options use case refuses inactive products', async () => {
  const { createPickupOptionsUseCase } = await import('../../dist/src/application/products/pickupOptions.mjs');
  const useCase = createPickupOptionsUseCase({ existsActive: async () => false });

  await assert.rejects(() => useCase.execute(9), {
    message: 'Listing is no longer available',
    statusCode: 400
  });
});