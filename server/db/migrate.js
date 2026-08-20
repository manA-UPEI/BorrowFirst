const fs = require('node:fs');
const path = require('node:path');

const { exec, run, all, withTransaction } = require('./connection');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

let migrationPromise = null;

// Splits a migration file into individual statements. node-postgres can send a
// multi-statement string in one simple query, but pg-mem -- the in-memory
// fallback used by the test suite and DATABASE_URL-less local dev -- executes
// one statement per call, so the runner has to do the splitting itself.
//
// Quote-, comment-, and dollar-quote-aware, so a semicolon inside a string
// literal, an identifier, a comment, or a function body does not end a
// statement.
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let index = 0;

  while (index < sql.length) {
    const character = sql[index];
    const remainder = sql.slice(index);

    if (remainder.startsWith('--')) {
      const lineEnd = sql.indexOf('\n', index);
      index = lineEnd === -1 ? sql.length : lineEnd + 1;
      current += '\n';
      continue;
    }

    if (remainder.startsWith('/*')) {
      const commentEnd = sql.indexOf('*/', index + 2);
      index = commentEnd === -1 ? sql.length : commentEnd + 2;
      current += ' ';
      continue;
    }

    if (character === "'" || character === '"') {
      let cursor = index + 1;

      while (cursor < sql.length) {
        if (sql[cursor] === character) {
          // A doubled quote is an escaped quote, not the end of the literal.
          if (sql[cursor + 1] === character) {
            cursor += 2;
            continue;
          }

          break;
        }

        cursor += 1;
      }

      current += sql.slice(index, cursor + 1);
      index = cursor + 1;
      continue;
    }

    const dollarQuote = /^\$[A-Za-z_0-9]*\$/.exec(remainder);

    if (dollarQuote) {
      const tag = dollarQuote[0];
      const closingIndex = sql.indexOf(tag, index + tag.length);
      const end = closingIndex === -1 ? sql.length : closingIndex + tag.length;

      current += sql.slice(index, end);
      index = end;
      continue;
    }

    if (character === ';') {
      statements.push(current);
      current = '';
      index += 1;
      continue;
    }

    current += character;
    index += 1;
  }

  statements.push(current);

  return statements
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();
}

async function ensureMigrationsTable() {
  await exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
}

async function getAppliedMigrations() {
  const rows = await all('SELECT name FROM schema_migrations');
  return new Set(rows.map((row) => row.name));
}

async function applyMigration(fileName) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), 'utf8');
  const statements = splitStatements(sql);

  // One transaction per migration: Postgres runs DDL transactionally, so a
  // migration that fails partway leaves no half-applied schema behind and is
  // retried in full on the next boot.
  await withTransaction(async () => {
    for (const statement of statements) {
      try {
        await exec(statement);
      } catch (error) {
        error.message = `Migration ${fileName} failed on statement:\n${statement}\n\n${error.message}`;
        throw error;
      }
    }

    await run('INSERT INTO schema_migrations (name) VALUES (?)', [fileName]);
  });
}

async function applyPendingMigrations() {
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  const pending = listMigrationFiles().filter((fileName) => !applied.has(fileName));

  for (const fileName of pending) {
    await applyMigration(fileName);
  }

  return pending;
}

// Memoized like the schema bootstrap it replaces, so concurrent callers during
// startup share one run rather than racing each other through the same DDL.
function runMigrations() {
  if (!migrationPromise) {
    migrationPromise = applyPendingMigrations().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }

  return migrationPromise;
}

module.exports = runMigrations;
module.exports.splitStatements = splitStatements;
module.exports.listMigrationFiles = listMigrationFiles;
