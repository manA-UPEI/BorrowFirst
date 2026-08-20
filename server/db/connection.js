const { AsyncLocalStorage } = require('node:async_hooks');

const { Pool, types } = require('pg');

types.setTypeParser(types.builtins.INT8, (value) => Number(value));
types.setTypeParser(types.builtins.NUMERIC, (value) => Number(value));
types.setTypeParser(types.builtins.DATE, (value) => value);
// Deliberately timezone-naive: pickup_meetup_at/return_meetup_at are wall-clock
// times for a physical, single-campus meetup, not absolute instants. Appending
// 'Z' here would relabel a naive value as UTC, and every display path (see
// helpers.js formatDateTimeLabel/formatDateTimeInputValue) runs values through
// `new Date(...)`, which converts a real UTC instant to the *viewer's* local
// time -- turning "we agreed to meet at 10:00" into a different displayed hour
// for anyone whose browser isn't in the same offset the server happened to
// write it in. Leaving the string bare keeps it inert: `new Date()` treats an
// offset-less string as already-local, so it displays back unchanged everywhere.
types.setTypeParser(types.builtins.TIMESTAMP, (value) => value.replace(' ', 'T'));
types.setTypeParser(types.builtins.TIMESTAMPTZ, (value) => new Date(value).toISOString());

const transactionStorage = new AsyncLocalStorage();
const connectionString = typeof process.env.DATABASE_URL === 'string'
  ? process.env.DATABASE_URL.trim()
  : '';

function createPool() {
  if (connectionString) {
    return new Pool({
      connectionString
    });
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL must be configured in production.');
  }

  const { newDb } = require('pg-mem');

  const memoryDatabase = newDb({
    autoCreateForeignKeyIndices: true
  });
  const adapter = memoryDatabase.adapters.createPg();

  return new adapter.Pool();
}

const db = createPool();

function convertPositionalParameters(sql) {
  let parameterIndex = 0;

  return sql.replace(/\?/g, () => {
    parameterIndex += 1;
    return `$${parameterIndex}`;
  });
}

function getExecutor() {
  const transactionState = transactionStorage.getStore();
  return transactionState?.client || db;
}

function getLastId(row) {
  if (!row || typeof row !== 'object') {
    return undefined;
  }

  if (Object.hasOwn(row, 'lastID')) {
    return row.lastID;
  }

  if (Object.hasOwn(row, 'id')) {
    return row.id;
  }

  return undefined;
}

async function query(sql, params = []) {
  const executor = getExecutor();
  const text = convertPositionalParameters(sql);
  return executor.query(text, params);
}

// Runs SQL verbatim, without the `?` -> `$n` rewrite the other helpers apply.
// Migration files are authored as plain Postgres and may legitimately contain a
// literal `?`, which convertPositionalParameters would silently turn into a
// placeholder the statement has no binding for.
async function exec(sql) {
  const executor = getExecutor();
  return executor.query(sql);
}

async function run(sql, params = []) {
  const result = await query(sql, params);
  return {
    lastID: getLastId(result.rows[0]),
    changes: result.rowCount,
    rows: result.rows
  };
}

async function get(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0];
}

async function all(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

async function withTransaction(work) {
  const activeTransaction = transactionStorage.getStore();

  if (activeTransaction) {
    return work();
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const result = await transactionStorage.run({ client }, async () => work());
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }

    throw error;
  } finally {
    client.release();
  }
}

function close() {
  return db.end();
}

module.exports = {
  db,
  exec,
  run,
  get,
  all,
  withTransaction,
  close
};
