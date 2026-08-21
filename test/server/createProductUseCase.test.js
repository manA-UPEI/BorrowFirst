const assert = require('node:assert/strict');
const test = require('node:test');

test('create product use case uploads images, marks the cover, and persists the cover URL', async () => {
  const { createProductUseCase } = await import('../../dist/src/application/products/createProduct.mjs');
  const calls = [];
  const useCase = createProductUseCase({
    validateFields: () => ({ name: 'Camera', description: 'Kit', condition: 'Good', price: 10, imageUrl: '' }),
    validateCoverIndex: () => ({ coverIndex: 1 }),
    validatePickupWindows: () => ({ message: '', pickupWindows: [] }),
    validateAvailability: () => ({ message: '', availability: [] })
  }, {
    createProduct: async () => 42,
    addProductImage: async (input) => calls.push(['image', input.sortOrder, input.isCover]),
    updateCoverImage: async (_id, url) => calls.push(['cover', url])
  }, {
    uploadProductImage: async (_file, input) => ({
      publicId: `image-${input.sortOrder}`,
      url: `https://example.test/${input.sortOrder}`,
      width: null,
      height: null,
      bytes: 10,
      mimeType: 'image/png'
    }),
    deleteProductImage: async () => true
  }, { run: async (operation) => operation() });

  const id = await useCase.execute({
    lenderId: 7,
    fields: {},
    coverIndex: '1',
    files: [{ buffer: Buffer.from('a'), mimeType: 'image/png', originalName: 'a.png' }, { buffer: Buffer.from('b'), mimeType: 'image/png', originalName: 'b.png' }]
  });

  assert.equal(id, 42);
  assert.deepEqual(calls, [['image', 0, false], ['image', 1, true], ['cover', 'https://example.test/1']]);
});