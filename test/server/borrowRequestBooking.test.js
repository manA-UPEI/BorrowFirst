const assert = require('node:assert/strict');
const test = require('node:test');

// Far enough out that these stay valid without pinning a clock, and the pickup
// meetup is genuinely in the future.
const START = '2099-03-10';
const END = '2099-03-14';
const MEETUP = '2099-03-10T10:00';

async function loadUseCase(overrides = {}) {
  const { createBorrowRequestUseCase } = await import('../../dist/src/application/notifications/createBorrowRequest.mjs');
  const created = [];

  const repository = {
    expireStaleApprovals: async () => {},
    listCurrentTransactions: async () => [],
    findProduct: async () => ({ lenderId: 9, borrowerId: null, isActive: true }),
    ensurePickupOptions: async () => {},
    listPickupOptions: async () => [{ optionIndex: 1, startTime: '09:00 AM', endTime: '11:00 AM' }],
    listAvailabilityWindows: async () => [],
    listBookedRanges: async () => [],
    findPendingRequest: async () => false,
    createRequest: async (input) => {
      created.push(input);
      return 77;
    },
    ...overrides
  };

  return {
    useCase: createBorrowRequestUseCase(repository, {
      decorate: (entry) => entry,
      getBlockMessage: () => 'blocked'
    }),
    created
  };
}

function request(overrides = {}) {
  return {
    borrowerId: 3,
    productId: 2,
    pickupOption: 1,
    pickupMeetupAt: MEETUP,
    startDate: START,
    dueDate: END,
    ...overrides
  };
}

test('a valid date range is persisted with its start date', async () => {
  const { useCase, created } = await loadUseCase();

  const id = await useCase.execute(request());

  assert.equal(id, 77);
  assert.equal(created.length, 1);
  assert.equal(created[0].startDate, START);
  assert.equal(created[0].dueDate, END);
});

test('a request overlapping a live booking is rejected with the clashing range', async () => {
  const { useCase, created } = await loadUseCase({
    listBookedRanges: async () => [{ id: 5, start_date: '2099-03-12', due_date: '2099-03-18' }]
  });

  await assert.rejects(
    () => useCase.execute(request()),
    { message: 'Already booked from 2099-03-12 to 2099-03-18', statusCode: 400 }
  );
  assert.equal(created.length, 0, 'nothing may be written when the range clashes');
});

test('booked ranges are read through the same normalizer as Postgres dates', async () => {
  // pg-mem hands back Date objects where Postgres yields YYYY-MM-DD strings; the
  // clash must be detected either way.
  const { useCase } = await loadUseCase({
    listBookedRanges: async () => [{
      id: 5,
      start_date: new Date('2099-03-12T00:00:00.000Z'),
      due_date: new Date('2099-03-18T00:00:00.000Z')
    }]
  });

  await assert.rejects(() => useCase.execute(request()), /Already booked from 2099-03-12 to 2099-03-18/);
});

test('a request outside every declared availability window is rejected', async () => {
  const { useCase } = await loadUseCase({
    listAvailabilityWindows: async () => [
      { kind: 'available', start_date: '2099-04-01', end_date: '2099-04-30' }
    ]
  });

  await assert.rejects(
    () => useCase.execute(request()),
    /outside the dates this item is offered/
  );
});

test('a request landing on a blackout is rejected', async () => {
  const { useCase } = await loadUseCase({
    listAvailabilityWindows: async () => [
      { kind: 'available', start_date: '2099-01-01', end_date: '2099-12-31' },
      { kind: 'blackout', start_date: '2099-03-13', end_date: '2099-03-15' }
    ]
  });

  await assert.rejects(
    () => useCase.execute(request()),
    /unavailable from 2099-03-13 to 2099-03-15/
  );
});

test('a listing with no declared windows stays bookable at any time', async () => {
  const { useCase, created } = await loadUseCase({ listAvailabilityWindows: async () => [] });

  await useCase.execute(request());

  assert.equal(created.length, 1);
});

test('the pickup meetup must fall on the first day of the booking', async () => {
  const { useCase } = await loadUseCase();

  await assert.rejects(
    () => useCase.execute(request({ pickupMeetupAt: '2099-03-11T10:00' })),
    { message: 'Pickup meetup must be on the first day of the booking', statusCode: 400 }
  );
});

test('the pickup meetup must still fall inside the chosen pickup window', async () => {
  const { useCase } = await loadUseCase();

  await assert.rejects(
    () => useCase.execute(request({ pickupMeetupAt: '2099-03-10T16:00' })),
    /Pickup meetup must be between 09:00 AM and 11:00 AM/
  );
});

test('a loan longer than the maximum is rejected', async () => {
  const { MAX_LOAN_DAYS } = await import('../../dist/src/application/notifications/createBorrowRequest.mjs');
  const { useCase } = await loadUseCase();

  assert.equal(MAX_LOAN_DAYS, 90);

  await assert.rejects(
    () => useCase.execute(request({ dueDate: '2099-09-01' })),
    new RegExp(`limited to ${MAX_LOAN_DAYS} days`)
  );
});

test('a return date before the start date is rejected', async () => {
  const { useCase } = await loadUseCase();

  await assert.rejects(
    () => useCase.execute(request({ dueDate: '2099-03-09' })),
    /Return date must be on or after the start date/
  );
});

test('a request omitting the start date falls back to the pickup day', async () => {
  const { useCase, created } = await loadUseCase();

  await useCase.execute(request({ startDate: undefined, dueDate: '2099-03-12' }));

  assert.equal(created[0].startDate, '2099-03-10');
});
