import { createRequire } from 'node:module';

// Delegates to server.js rather than reimplementing startup here: server.js is
// the one that loads .env (`dotenv.config()`) and runs validateEnvironment()
// before listening. Building app.js directly, as this file used to, skipped
// both -- APP_ORIGIN (and everything else .env provides) was silently never
// set for `npm start`, which made every state-changing API request fail the
// origin check regardless of what origin it actually came from.
const loadLegacyModule = createRequire(import.meta.url);
const legacyServer = loadLegacyModule('../../server') as {
  startServer: () => Promise<void>;
};

export async function startServer(): Promise<void> {
  return legacyServer.startServer();
}

if (process.argv[1]?.endsWith('server.mjs')) {
  startServer().catch((error: unknown) => {
    console.error('Failed to start BorrowFirst.', error);
    process.exitCode = 1;
  });
}