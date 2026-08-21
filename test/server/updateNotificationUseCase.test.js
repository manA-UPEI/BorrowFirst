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
// A far-future date so these stay valid without pinning a clock.
const FUTURE_MEETUP_HOUR = '14:00';
const FUTURE_MEETUP_DATE = '2099-03-10';

function pendingApprovalRepository(storedPickupMeetupAt, overrides = {}) {
  let setApprovedReservationCall = null;

  return {
    repository: {
      findById: async () => ({
        id: 4,
        lender_id: 8,
        borrower_id: 9,
        product_id: 1,
        status: 'pending',
        pickup_option: 1,
        pickup_meetup_at: storedPickupMeetupAt,
        due_date: '2099-03-14',
        start_date: FUTURE_MEETUP_DATE
      }),
      findProduct: async () => ({ Product_Is_Active: 1, Product_Borrower_ID: null }),
      ensurePickupOptions: async () => {},
      listPickupOptions: async () => [{ option_index: 1, start_time: '01:00 PM', end_time: '05:00 PM' }],
      setApprovedReservation: async (id, input) => { setApprovedReservationCall = { id, input }; },
      assignBorrower: async () => {},
      rejectOtherPending: async () => {},
      ...overrides
    },
    getCall: () => setApprovedReservationCall
  };
}

function approvalServices() {
  return {
    run: async (operation) => operation(),
    createPickupCode: () => ({ hash: 'hashed-pickup-code', expiresAt: 'pickup-expiry' }),
    getApprovalExpiry: () => 'approval-expiry'
  };
}

test('approving without a fresh meetup accepts a Postgres-shaped stored string with seconds', async () => {
  const { createUpdateNotificationUseCase } = await import('../../dist/src/application/notifications/updateNotification.mjs');
  // What connection.js's TIMESTAMP parser actually yields on real Postgres: no
  // trailing Z (timezone-naive by design), but always with seconds.
  const stored = `${FUTURE_MEETUP_DATE}T${FUTURE_MEETUP_HOUR}:00`;
  const { repository, getCall } = pendingApprovalRepository(stored);

  const useCase = createUpdateNotificationUseCase(repository, approvalServices());
  const result = await useCase.execute({ notificationId: 4, userId: 8, action: 'approve' });

  assert.deepEqual(result, { approved: true });
  assert.equal(getCall().input.pickupMeetupAt, `${FUTURE_MEETUP_DATE}T${FUTURE_MEETUP_HOUR}`);
});

test('approving without a fresh meetup accepts a pg-mem Date object', async () => {
  const { createUpdateNotificationUseCase } = await import('../../dist/src/application/notifications/updateNotification.mjs');
  // What pg-mem -- the in-memory fallback used by tests and DATABASE_URL-less
  // local dev -- returns instead of a string: a Date whose UTC fields hold the
  // original naive wall-clock value.
  const stored = new Date(`${FUTURE_MEETUP_DATE}T${FUTURE_MEETUP_HOUR}:00.000Z`);
  const { repository, getCall } = pendingApprovalRepository(stored);

  const useCase = createUpdateNotificationUseCase(repository, approvalServices());
  const result = await useCase.execute({ notificationId: 4, userId: 8, action: 'approve' });

  assert.deepEqual(result, { approved: true });
  assert.equal(getCall().input.pickupMeetupAt, `${FUTURE_MEETUP_DATE}T${FUTURE_MEETUP_HOUR}`);
});

test('approving still rejects a stored meetup that has drifted off the booking start date', async () => {
  const { createUpdateNotificationUseCase } = await import('../../dist/src/application/notifications/updateNotification.mjs');
  // One day after start_date -- can happen on a legacy row from before
  // start_date existed, or if the stored meetup and booking start ever
  // disagree for any other reason.
  const stored = `2099-03-11T${FUTURE_MEETUP_HOUR}:00`;
  const { repository } = pendingApprovalRepository(stored);

  const useCase = createUpdateNotificationUseCase(repository, approvalServices());

  await assert.rejects(
    () => useCase.execute({ notificationId: 4, userId: 8, action: 'approve' }),
    { message: 'Pickup meetup must be on the first day of the booking', statusCode: 400 }
  );
});

test('approving with a freshly submitted meetup still validates and stores it as-is', async () => {
  const { createUpdateNotificationUseCase } = await import('../../dist/src/application/notifications/updateNotification.mjs');
  const { repository, getCall } = pendingApprovalRepository(`${FUTURE_MEETUP_DATE}T10:00:00`);

  const useCase = createUpdateNotificationUseCase(repository, approvalServices());
  const freshMeetup = `${FUTURE_MEETUP_DATE}T15:30`;

  const result = await useCase.execute({
    notificationId: 4,
    userId: 8,
    action: 'approve',
    pickupMeetupAt: freshMeetup
  });

  assert.deepEqual(result, { approved: true });
  assert.equal(getCall().input.pickupMeetupAt, freshMeetup);
});
