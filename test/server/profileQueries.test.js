const assert = require('node:assert/strict');
const test = require('node:test');

test('profile use case denies unrelated users', async () => {
  const { createUserProfileUseCase } = await import('../../dist/src/application/auth/profileQueries.mjs');
  const useCase = createUserProfileUseCase({
    findInteractionBetweenUsers: async () => null,
    findInteractionByIdForUser: async () => null
  });
  await assert.rejects(() => useCase.execute(1, 2, ''), {
    message: 'You can only view profiles of users you have interacted with.',
    statusCode: 403
  });
});