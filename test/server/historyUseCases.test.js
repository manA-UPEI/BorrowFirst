const assert = require('node:assert/strict');
const test = require('node:test');

test('alerts use case filters entries without actionable alerts', async () => {
  const { createAlertsUseCase } = await import('../../dist/src/application/transactions/history.mjs');
  const alerts = createAlertsUseCase({
    expireStaleApprovals: async () => {},
    listCurrentForUser: async () => [{ id: 1 }, { id: 2 }]
  }, {
    present: (entry) => entry
  }, {
    present: (entry) => entry.id === 1 ? { id: entry.id, message: 'Pickup' } : null
  });

  assert.deepEqual(await alerts.execute(8), [{ id: 1, message: 'Pickup' }]);
});