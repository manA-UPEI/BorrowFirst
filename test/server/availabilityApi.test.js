const assert = require('node:assert/strict');
const test = require('node:test');

const {
  apiRequest,
  loginAs,
  resetDatabase,
  seedProduct,
  seedUser,
  startTestServer,
  stopTestServer
} = require('./helpers/httpHarness');
const { run } = require('../../server/db/connection');

let lender = null;
let borrower = null;
let otherBorrower = null;
let borrowerCookie = '';
let lenderCookie = '';

test.before(async () => {
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
});

test.beforeEach(async () => {
  await resetDatabase();
  lender = await seedUser({ email: 'lender@upei.ca', username: 'lender' });
  borrower = await seedUser({ email: 'borrower@upei.ca', username: 'borrower' });
  // Bookings that block the calendar belong to someone else: a loan held by the
  // requesting borrower trips the separate "finish your current loan" rule first.
  otherBorrower = await seedUser({ email: 'other@upei.ca', username: 'other' });
  lenderCookie = await loginAs(lender);
  borrowerCookie = await loginAs(borrower);
});

function addWindow(productId, kind, startDate, endDate) {
  return run(
    'INSERT INTO product_availability (product_id, kind, start_date, end_date) VALUES (?, ?, ?, ?)',
    [productId, kind, startDate, endDate]
  );
}

function addApprovedLoan(productId, startDate, dueDate) {
  return run(
    `INSERT INTO notifications (product_id, lender_id, borrower_id, pickup_option, status, start_date, due_date, approved_at)
     VALUES (?, ?, ?, 1, 'approved', ?, ?, NOW())`,
    [productId, lender.id, otherBorrower.id, startDate, dueDate]
  );
}

test('availability requires a session', async () => {
  const productId = await seedProduct({ lenderId: lender.id });
  const { response } = await apiRequest(`/api/products/${productId}/availability`);

  assert.equal(response.status, 401);
});

test('a listing with no declared windows reports itself as fully open', async () => {
  const productId = await seedProduct({ lenderId: lender.id });

  const { response, payload } = await apiRequest(
    `/api/products/${productId}/availability`,
    { cookie: borrowerCookie }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(payload.windows, []);
  assert.deepEqual(payload.unavailableRanges, []);
  assert.equal(payload.maxLoanDays, 90);
});

test('declared windows and blackouts are reported to borrowers', async () => {
  const productId = await seedProduct({ lenderId: lender.id });
  await addWindow(productId, 'available', '2099-03-01', '2099-03-31');
  await addWindow(productId, 'blackout', '2099-03-14', '2099-03-16');

  const { payload } = await apiRequest(
    `/api/products/${productId}/availability`,
    { cookie: borrowerCookie }
  );

  assert.deepEqual(payload.windows, [
    { kind: 'available', startDate: '2099-03-01', endDate: '2099-03-31' },
    { kind: 'blackout', startDate: '2099-03-14', endDate: '2099-03-16' }
  ]);
  assert.deepEqual(payload.unavailableRanges, [
    { startDate: '2099-03-14', endDate: '2099-03-16' }
  ]);
});

test('an approved loan occupies its range on the calendar', async () => {
  const productId = await seedProduct({ lenderId: lender.id });
  await addApprovedLoan(productId, '2099-04-02', '2099-04-06');

  const { payload } = await apiRequest(
    `/api/products/${productId}/availability`,
    { cookie: borrowerCookie }
  );

  assert.deepEqual(payload.unavailableRanges, [
    { startDate: '2099-04-02', endDate: '2099-04-06' }
  ]);
});

test('availability rejects unknown and removed listings', async () => {
  const removed = await seedProduct({ lenderId: lender.id, isActive: 0 });

  const missing = await apiRequest('/api/products/987654/availability', { cookie: borrowerCookie });
  const inactive = await apiRequest(`/api/products/${removed}/availability`, { cookie: borrowerCookie });

  assert.equal(missing.response.status, 404);
  assert.equal(inactive.response.status, 400);
  assert.deepEqual(inactive.payload, { message: 'Listing is no longer available' });
});

test('a lender-defined pickup window replaces the campus defaults', async () => {
  const created = await apiRequest('/api/products', {
    method: 'POST',
    cookie: lenderCookie,
    body: {
      name: 'Studio Monitor',
      price: 12,
      condition: 'Good',
      description: 'Near-field monitor.',
      imageUrl: '/images/tent.svg',
      pickupWindows: [
        { location: 'Robertson Library Desk', startTime: '13:00', endTime: '15:30' }
      ]
    }
  });

  assert.equal(created.response.status, 200);

  const { payload } = await apiRequest(
    `/api/pickup-options/${created.payload.id}`,
    { cookie: borrowerCookie }
  );

  assert.equal(payload.length, 1, 'the three defaults must not be added alongside');
  assert.equal(payload[0].location, 'Robertson Library Desk');
  // 24-hour form submissions are normalized to the "hh:mm AM" the pickup
  // validators parse.
  assert.equal(payload[0].start_time, '01:00 PM');
  assert.equal(payload[0].end_time, '03:30 PM');
  assert.equal(payload[0].option_index, 1);
});

test('a listing created without pickup windows still gets the defaults', async () => {
  const created = await apiRequest('/api/products', {
    method: 'POST',
    cookie: lenderCookie,
    body: {
      name: 'Plain Listing',
      price: 4,
      condition: 'Good',
      description: 'No windows declared.',
      imageUrl: '/images/tent.svg'
    }
  });

  const { payload } = await apiRequest(
    `/api/pickup-options/${created.payload.id}`,
    { cookie: borrowerCookie }
  );

  assert.equal(payload.length, 3);
});

test('availability supplied at creation is stored and reported', async () => {
  const created = await apiRequest('/api/products', {
    method: 'POST',
    cookie: lenderCookie,
    body: {
      name: 'Seasonal Kayak',
      price: 20,
      condition: 'Good',
      description: 'Summer only.',
      imageUrl: '/images/tent.svg',
      availability: [
        { kind: 'available', startDate: '2099-06-01', endDate: '2099-08-31' },
        { kind: 'blackout', startDate: '2099-07-01', endDate: '2099-07-07' }
      ]
    }
  });

  assert.equal(created.response.status, 200);

  const { payload } = await apiRequest(
    `/api/products/${created.payload.id}/availability`,
    { cookie: borrowerCookie }
  );

  assert.equal(payload.windows.length, 2);
  assert.deepEqual(payload.unavailableRanges, [
    { startDate: '2099-07-01', endDate: '2099-07-07' }
  ]);
});

test('malformed pickup windows and availability are rejected at creation', async () => {
  const badWindow = await apiRequest('/api/products', {
    method: 'POST',
    cookie: lenderCookie,
    body: {
      name: 'Bad Window',
      price: 5,
      condition: 'Good',
      description: 'Ends before it starts.',
      imageUrl: '/images/tent.svg',
      pickupWindows: [{ location: 'Library', startTime: '15:00', endTime: '13:00' }]
    }
  });

  const badDates = await apiRequest('/api/products', {
    method: 'POST',
    cookie: lenderCookie,
    body: {
      name: 'Bad Dates',
      price: 5,
      condition: 'Good',
      description: 'Impossible date.',
      imageUrl: '/images/tent.svg',
      availability: [{ kind: 'available', startDate: '2099-02-30', endDate: '2099-03-01' }]
    }
  });

  assert.equal(badWindow.response.status, 400);
  assert.deepEqual(badWindow.payload, { message: 'Pickup window must end after it starts' });
  assert.equal(badDates.response.status, 400);
  assert.deepEqual(badDates.payload, { message: 'Availability dates must look like 2026-03-01' });
});

test('a borrow request overlapping an approved booking is refused end to end', async () => {
  const productId = await seedProduct({ lenderId: lender.id });
  await addApprovedLoan(productId, '2099-05-10', '2099-05-14');

  const { response, payload } = await apiRequest('/api/notifications', {
    method: 'POST',
    cookie: borrowerCookie,
    body: {
      productId,
      pickupOption: 1,
      pickupMeetupAt: '2099-05-12T10:00',
      startDate: '2099-05-12',
      dueDate: '2099-05-16'
    }
  });

  assert.equal(response.status, 400);
  assert.deepEqual(payload, { message: 'Already booked from 2099-05-10 to 2099-05-14' });
});

test('a borrow request in a free range is accepted and stores its dates', async () => {
  const productId = await seedProduct({ lenderId: lender.id });
  await addApprovedLoan(productId, '2099-05-10', '2099-05-14');

  const { response, payload } = await apiRequest('/api/notifications', {
    method: 'POST',
    cookie: borrowerCookie,
    body: {
      productId,
      pickupOption: 1,
      pickupMeetupAt: '2099-05-15T10:00',
      startDate: '2099-05-15',
      dueDate: '2099-05-18'
    }
  });

  assert.equal(response.status, 200, JSON.stringify(payload));

  const { payload: availability } = await apiRequest(
    `/api/products/${productId}/availability`,
    { cookie: borrowerCookie }
  );

  // Still only the approved loan: a pending request does not hold the calendar.
  assert.deepEqual(availability.unavailableRanges, [
    { startDate: '2099-05-10', endDate: '2099-05-14' }
  ]);
});
