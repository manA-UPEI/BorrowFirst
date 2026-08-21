const assert = require('node:assert/strict');
const test = require('node:test');

const TODAY = '2026-03-10';

function range(startDate, endDate) {
  return { startDate, endDate };
}

function window_(kind, startDate, endDate) {
  return { kind, startDate, endDate };
}

async function loadPolicy() {
  return import('../../dist/src/domain/booking/availability.mjs');
}

function check(policy, requested, { windows = [], bookedRanges = [], maxLoanDays } = {}) {
  return policy.checkBooking({ requested, windows, bookedRanges, today: TODAY, maxLoanDays });
}

test('a range inside an open listing with no declared windows is bookable', async () => {
  const policy = await loadPolicy();

  assert.deepEqual(
    check(policy, range('2026-03-12', '2026-03-15')),
    { ok: true, reason: '' }
  );
});

test('malformed and impossible dates are rejected before anything else', async () => {
  const policy = await loadPolicy();

  assert.equal(check(policy, range('not-a-date', '2026-03-15')).reason, 'Invalid start date');
  assert.equal(check(policy, range('2026-03-12', '')).reason, 'Invalid return date');
  // Calendar-shaped but nonexistent.
  assert.equal(check(policy, range('2026-02-30', '2026-03-15')).reason, 'Invalid start date');
});

test('the return date must not precede the start date', async () => {
  const policy = await loadPolicy();

  assert.equal(
    check(policy, range('2026-03-15', '2026-03-12')).reason,
    'Return date must be on or after the start date'
  );
});

test('a start date before today is rejected but today itself is allowed', async () => {
  const policy = await loadPolicy();

  assert.equal(check(policy, range('2026-03-09', '2026-03-12')).reason, 'Start date cannot be in the past');
  assert.equal(check(policy, range(TODAY, '2026-03-12')).ok, true);
});

test('a request must fall entirely inside one declared availability window', async () => {
  const policy = await loadPolicy();
  const windows = [window_('available', '2026-03-01', '2026-03-20')];

  assert.equal(check(policy, range('2026-03-12', '2026-03-15'), { windows }).ok, true);

  // Straddling the end of the window is not "mostly fine".
  const straddling = check(policy, range('2026-03-18', '2026-03-25'), { windows });
  assert.equal(straddling.ok, false);
  assert.match(straddling.reason, /outside the dates this item is offered/);
});

test('a request may not span two separate availability windows', async () => {
  const policy = await loadPolicy();
  const windows = [
    window_('available', '2026-03-01', '2026-03-12'),
    window_('available', '2026-03-16', '2026-03-30')
  ];

  assert.equal(check(policy, range('2026-03-11', '2026-03-12'), { windows }).ok, true);
  assert.equal(check(policy, range('2026-03-17', '2026-03-20'), { windows }).ok, true);
  assert.equal(check(policy, range('2026-03-11', '2026-03-20'), { windows }).ok, false);
});

test('blackout ranges carve days back out of an availability window', async () => {
  const policy = await loadPolicy();
  const windows = [
    window_('available', '2026-03-01', '2026-03-31'),
    window_('blackout', '2026-03-14', '2026-03-16')
  ];

  assert.equal(check(policy, range('2026-03-11', '2026-03-13'), { windows }).ok, true);

  const blocked = check(policy, range('2026-03-13', '2026-03-15'), { windows });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /unavailable from 2026-03-14 to 2026-03-16/);

  // Touching only the boundary day still clashes: ranges are inclusive.
  assert.equal(check(policy, range('2026-03-16', '2026-03-18'), { windows }).ok, false);
});

test('an existing booking blocks an overlapping request', async () => {
  const policy = await loadPolicy();
  const bookedRanges = [range('2026-03-14', '2026-03-18')];

  const clash = check(policy, range('2026-03-17', '2026-03-20'), { bookedRanges });
  assert.equal(clash.ok, false);
  assert.match(clash.reason, /Already booked from 2026-03-14 to 2026-03-18/);

  // Abutting without overlapping is fine: pick up the day after the return.
  assert.equal(check(policy, range('2026-03-19', '2026-03-21'), { bookedRanges }).ok, true);
  assert.equal(check(policy, range('2026-03-11', '2026-03-13'), { bookedRanges }).ok, true);
});

test('a booking that fully contains an existing one is still a clash', async () => {
  const policy = await loadPolicy();

  assert.equal(
    check(policy, range('2026-03-11', '2026-03-25'), { bookedRanges: [range('2026-03-14', '2026-03-18')] }).ok,
    false
  );
});

test('maxLoanDays counts both endpoints', async () => {
  const policy = await loadPolicy();

  assert.equal(check(policy, range('2026-03-11', '2026-03-17'), { maxLoanDays: 7 }).ok, true);
  assert.equal(check(policy, range('2026-03-11', '2026-03-18'), { maxLoanDays: 7 }).ok, false);
});

test('daysBetween is inclusive of both endpoints', async () => {
  const { daysBetween } = await loadPolicy();

  assert.equal(daysBetween(range('2026-03-11', '2026-03-11')), 1);
  assert.equal(daysBetween(range('2026-03-11', '2026-03-13')), 3);
  // Spans a month boundary.
  assert.equal(daysBetween(range('2026-03-30', '2026-04-02')), 4);
});

test('toDateOnly accepts both the Postgres string and the pg-mem Date', async () => {
  const { toDateOnly } = await loadPolicy();

  // What real Postgres yields through the registered DATE parser.
  assert.equal(toDateOnly('2026-03-05'), '2026-03-05');
  // What pg-mem yields for the same column: a Date at UTC midnight.
  assert.equal(toDateOnly(new Date('2026-03-05T00:00:00.000Z')), '2026-03-05');
  // A TIMESTAMP string is truncated to its date part.
  assert.equal(toDateOnly('2026-03-05T10:00:00'), '2026-03-05');
  assert.equal(toDateOnly(null), '');
  assert.equal(toDateOnly(undefined), '');
});

test('normalizeWindow accepts snake_case rows and rejects inverted ranges', async () => {
  const { normalizeWindow } = await loadPolicy();

  assert.deepEqual(
    normalizeWindow({ kind: 'blackout', start_date: '2026-03-14', end_date: '2026-03-16' }),
    { kind: 'blackout', startDate: '2026-03-14', endDate: '2026-03-16' }
  );
  // Anything not explicitly a blackout is an availability window.
  assert.equal(normalizeWindow({ kind: 'available', start_date: '2026-03-01', end_date: '2026-03-02' }).kind, 'available');
  assert.equal(normalizeWindow({ kind: 'available', start_date: '2026-03-05', end_date: '2026-03-01' }), null);
  assert.equal(normalizeWindow({ kind: 'available', start_date: 'nope', end_date: '2026-03-01' }), null);
});

test('getUnavailableRanges merges blackouts and bookings in date order', async () => {
  const { getUnavailableRanges } = await loadPolicy();

  assert.deepEqual(
    getUnavailableRanges(
      [window_('available', '2026-03-01', '2026-03-31'), window_('blackout', '2026-03-20', '2026-03-22')],
      [range('2026-03-05', '2026-03-07')]
    ),
    [range('2026-03-05', '2026-03-07'), range('2026-03-20', '2026-03-22')]
  );
});
