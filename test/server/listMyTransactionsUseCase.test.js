const assert = require('node:assert/strict');
const test = require('node:test');

test('list my transactions refreshes lifecycle state before presenting entries', async () => {
  const { createListMyTransactionsUseCase } = await import('../../dist/src/application/transactions/listMyTransactions.mjs');
  const calls = [];
  const useCase = createListMyTransactionsUseCase({
    expireStaleApprovals: async () => calls.push('expire'),
    ensureBorrowerPickupCodes: async (userId) => calls.push(['codes', userId]),
    listCurrentForUser: async (userId) => {
      calls.push(['list', userId]);
      return [{ id: 10 }];
    }
  }, {
    present: (entry, userId) => ({ ...entry, userId })
  });

  assert.deepEqual(await useCase.execute(7), [{ id: 10, userId: 7 }]);
  assert.deepEqual(calls, ['expire', ['codes', 7], ['list', 7]]);
});