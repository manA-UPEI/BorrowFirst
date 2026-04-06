require('dotenv').config();

const initializeDatabase = require('../server/db/init');

async function main() {
  await initializeDatabase.seedDemoData();
  console.log('Demo data seeded.');
}

main().catch((error) => {
  console.error('Failed to seed demo data.', error);
  process.exit(1);
});
