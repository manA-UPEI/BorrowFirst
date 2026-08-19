const assert = require('node:assert/strict');
const test = require('node:test');

test('the TIMESTAMP column parser stays timezone-naive (no trailing Z)', () => {
  // pickup_meetup_at/return_meetup_at are physical, single-campus wall-clock
  // times, not absolute instants -- appending 'Z' here would make every
  // display path (`new Date(...)` in helpers.js) reinterpret the value through
  // the *viewer's* browser timezone, silently shifting the displayed meetup
  // time away from what was actually agreed. Registering this parser is a
  // require()-time side effect of server/db/connection.js, so requiring it is
  // enough to exercise the real, registered parser -- not a reimplementation.
  require('../../server/db/connection');
  const { types } = require('pg');
  const parser = types.getTypeParser(types.builtins.TIMESTAMP);

  const parsed = parser('2026-08-19 10:00:00');

  assert.equal(parsed, '2026-08-19T10:00:00');
  assert.ok(!parsed.endsWith('Z'), 'must not be labeled as UTC');

  // The whole point: an offset-less string round-trips through `new Date()`
  // as already-local, so it displays back with the exact hour it was given,
  // regardless of what timezone the process happens to be running in.
  assert.equal(new Date(parsed).getHours(), 10);
});
