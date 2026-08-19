const assert = require('node:assert/strict');
const test = require('node:test');

test('my ratings use case normalizes missing summary values', async () => {
  const { createMyRatingsUseCase } = await import('../../dist/src/application/ratings/ratingQueries.mjs');
  const useCase = createMyRatingsUseCase({
    getSummary: async () => null,
    listRecentRatings: async () => []
  });

  assert.deepEqual(await useCase.execute(3), { count: 0, average: 0, ratings: [] });
});