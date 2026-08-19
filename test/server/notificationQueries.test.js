const assert = require('node:assert/strict');
const test = require('node:test');

test('notification list use case expires stale approvals before querying lender requests', async () => {
  const { createListNotificationsUseCase } = await import('../../dist/src/application/notifications/listNotifications.mjs');
  const calls = [];
  const useCase = createListNotificationsUseCase({
    expireStaleApprovals: async () => calls.push('expire'),
    listForLender: async (userId) => {
      calls.push(['list', userId]);
      return [{ id: 2 }];
    }
  }, { present: (entry) => ({ ...entry, decorated: true }) });

  assert.deepEqual(await useCase.execute(5), [{ id: 2, decorated: true }]);
  assert.deepEqual(calls, ['expire', ['list', 5]]);
});