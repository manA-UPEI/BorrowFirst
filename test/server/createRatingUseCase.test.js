const assert = require('node:assert/strict');
const test = require('node:test');

test('create rating use case requires an approved counterpart', async () => {
  const { createRatingUseCase } = await import('../../dist/src/application/ratings/createRating.mjs');
  const useCase = createRatingUseCase({ findApprovedCounterparty: async () => null });

  await assert.rejects(() => useCase.execute(4, 9, 5), {
    message: 'User is not eligible for rating',
    statusCode: 403
  });
});