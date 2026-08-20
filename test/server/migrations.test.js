const assert = require('node:assert/strict');
const test = require('node:test');

process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const runMigrations = require('../../server/db/migrate');
const initializeDatabase = require('../../server/db/init');
const { run, all, close } = require('../../server/db/connection');

const { splitStatements, listMigrationFiles } = runMigrations;

test.after(async () => {
  await close();
});

test('splitStatements separates plain statements and drops comments', () => {
  const statements = splitStatements(`
    -- leading comment; with a semicolon
    CREATE TABLE a (id INTEGER);
    /* block ; comment */
    CREATE TABLE b (id INTEGER);
  `);

  assert.deepEqual(statements, [
    'CREATE TABLE a (id INTEGER)',
    'CREATE TABLE b (id INTEGER)'
  ]);
});

test('splitStatements does not split on semicolons inside literals or identifiers', () => {
  const statements = splitStatements(
    `INSERT INTO t (v) VALUES ('a;b');
     INSERT INTO t (v) VALUES ('it''s; fine');
     SELECT "weird;column" FROM t;`
  );

  assert.equal(statements.length, 3);
  assert.match(statements[0], /'a;b'/);
  assert.match(statements[1], /'it''s; fine'/);
  assert.match(statements[2], /"weird;column"/);
});

test('splitStatements keeps dollar-quoted bodies intact', () => {
  const statements = splitStatements(
    `CREATE FUNCTION f() RETURNS INTEGER AS $$ BEGIN; RETURN 1; END; $$ LANGUAGE plpgsql;
     SELECT 1;`
  );

  assert.equal(statements.length, 2);
  assert.match(statements[0], /\$\$ BEGIN; RETURN 1; END; \$\$/);
  assert.equal(statements[1], 'SELECT 1');
});

test('splitStatements ignores a trailing statement that is only whitespace', () => {
  assert.deepEqual(splitStatements('SELECT 1;\n\n   \n'), ['SELECT 1']);
});

test('every migration file is applied exactly once and recorded', async () => {
  await initializeDatabase();

  const applied = await all('SELECT name FROM schema_migrations ORDER BY name');

  assert.deepEqual(applied.map((row) => row.name), listMigrationFiles());

  // initializeDatabase is called by every server boot; a second call must not
  // re-apply anything.
  await initializeDatabase();

  const reapplied = await all('SELECT name FROM schema_migrations ORDER BY name');
  assert.deepEqual(reapplied.map((row) => row.name), listMigrationFiles());
});

test('foreign keys reject rows that reference a missing parent', async () => {
  await initializeDatabase();

  await assert.rejects(
    run(
      `INSERT INTO products (
        "Product_Name",
        "Product_Lender_ID",
        "Product_Is_Active",
        "Product_Lending_Charge"
      ) VALUES (?, ?, ?, ?)`,
      ['Orphaned Listing', 987654, 1, 5]
    ),
    'a product referencing a non-existent lender must be rejected'
  );

  await assert.rejects(
    run(
      'INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)',
      [987654, '/images/tent.svg', 0]
    ),
    'a product image referencing a non-existent product must be rejected'
  );
});
