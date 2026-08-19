const assert = require('node:assert/strict');
const test = require('node:test');

test('notification update use case rejects invalid actions before opening a transaction', async () => {
  const { createUpdateNotificationUseCase } = await import('../../dist/src/application/notifications/updateNotification.mjs');
  let transactions = 0;
  const useCase = createUpdateNotificationUseCase({}, {
    run: async (operation) => { transactions += 1; return operation(); }
  });

  await assert.rejects(() => useCase.execute({ notificationId: 4, userId: 2, action: 'unknown' }), {
    message: 'Invalid action',
    statusCode: 400
  });
  assert.equal(transactions, 0);
});

test('notification update use case protects lender-only actions', async () => {
  const { createUpdateNotificationUseCase } = await import('../../dist/src/application/notifications/updateNotification.mjs');
  const useCase = createUpdateNotificationUseCase({
    findById: async () => ({ lender_id: 8, borrower_id: 9, status: 'pending' })
  }, { run: async (operation) => operation() });

  await assert.rejects(() => useCase.execute({ notificationId: 4, userId: 9, action: 'approve' }), {
    message: 'Not allowed',
    statusCode: 403
  });
});

test('issuing a return code accepts a database-round-tripped return meetup timestamp', async () => {
  // A TIMESTAMPTZ column round-trip always comes back as a full ISO string
  // ("...T14:00:00.000Z"), never the bare "YYYY-MM-DDTHH:MM" shape a freshly
  // submitted form value has. issue_return_code re-validates the *stored*
  // value, so it must accept this shape -- a stricter, form-input-shaped check
  // here rejected every real return meetup once it had been through the DB.
  const { createUpdateNotificationUseCase } = await import('../../dist/src/application/notifications/updateNotification.mjs');
  const futureIso = new Date(Date.now() + 60_000).toISOString();
  let issuedWith = null;

  const useCase = createUpdateNotificationUseCase({
    findById: async () => ({
      id: 4, lender_id: 8, borrower_id: 9, status: 'active', return_meetup_at: futureIso
    }),
    issueReturnCode: async (id, hash, expiresAt) => { issuedWith = { id, hash, expiresAt }; }
  }, {
    run: async (operation) => operation(),
    createReturnCode: () => ({ hash: 'hashed-code', expiresAt: 'expiry' })
  });

  const result = await useCase.execute({ notificationId: 4, userId: 9, action: 'issue_return_code' });

  assert.deepEqual(result, { returnCodeIssued: true, returnCodeExpiresAt: 'expiry' });
  assert.deepEqual(issuedWith, { id: 4, hash: 'hashed-code', expiresAt: 'expiry' });
});

test('issuing a return code still rejects a return meetup that is missing or in the past', async () => {
  const { createUpdateNotificationUseCase } = await import('../../dist/src/application/notifications/updateNotification.mjs');

  const missingMeetup = createUpdateNotificationUseCase({
    findById: async () => ({ id: 4, lender_id: 8, borrower_id: 9, status: 'active', return_meetup_at: null })
  }, { run: async (operation) => operation() });

  await assert.rejects(() => missingMeetup.execute({ notificationId: 4, userId: 9, action: 'issue_return_code' }), {
    message: 'Set a valid return meetup before generating a return code.',
    statusCode: 400
  });

  const pastIso = new Date(Date.now() - 60_000).toISOString();
  const pastMeetup = createUpdateNotificationUseCase({
    findById: async () => ({ id: 4, lender_id: 8, borrower_id: 9, status: 'active', return_meetup_at: pastIso })
  }, { run: async (operation) => operation() });

  await assert.rejects(() => pastMeetup.execute({ notificationId: 4, userId: 9, action: 'issue_return_code' }), {
    message: 'Set a valid return meetup before generating a return code.',
    statusCode: 400
  });
});