// Keyset ("seek") pagination helpers.
//
// Offset pagination re-scans every skipped row and, worse, silently skips or
// repeats items when rows are inserted or removed between page requests -- which
// is the normal case for a catalog. A cursor instead names the last row of the
// previous page, so the next page is a range scan from a fixed point.
//
// Cursors are opaque to callers on purpose: the encoded fields are an
// implementation detail of the sort order, and clients must not construct them.

const CURSOR_SEPARATOR = '|';

function encodeCursor(values) {
  const payload = values.map((value) => String(value)).join(CURSOR_SEPARATOR);
  return Buffer.from(payload, 'utf8').toString('base64url');
}

// Returns null for anything that is not a cursor this process produced, so a
// malformed or hand-crafted value degrades to "first page" instead of erroring.
function decodeCursor(cursor, expectedLength) {
  if (typeof cursor !== 'string' || !cursor) {
    return null;
  }

  let payload;

  try {
    payload = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const parts = payload.split(CURSOR_SEPARATOR);

  if (parts.length !== expectedLength) {
    return null;
  }

  const values = parts.map((part) => Number(part));

  if (values.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return values;
}

function normalizeLimit(value, { fallback = 24, max = 100 } = {}) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

module.exports = {
  encodeCursor,
  decodeCursor,
  normalizeLimit
};
