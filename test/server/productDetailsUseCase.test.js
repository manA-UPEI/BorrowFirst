const assert = require('node:assert/strict');
const test = require('node:test');

test('product details use case derives viewer permissions and legacy image fallback', async () => {
  const { createGetProductDetailsUseCase } = await import('../../dist/src/application/products/getProductDetails.mjs');
  const useCase = createGetProductDetailsUseCase({
    findById: async () => ({
      id: 3,
      name: 'Bike',
      lenderId: 2,
      borrowerId: null,
      isActive: true,
      currentTransactionStatus: '',
      description: 'Bike',
      condition: 'Good',
      imageUrl: '/images/bike.svg',
      lendingCharge: 4
    }),
    listImages: async () => []
  });

  const result = await useCase.execute(3, 9);

  assert.equal(result.viewerCanRequest, true);
  assert.deepEqual(result.images, [{ id: 0, url: '/images/bike.svg', sortOrder: 0, isCover: true }]);
});