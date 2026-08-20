// Shared harness for tests that exercise the app over real HTTP.
//
// It boots the actual Express app on an ephemeral port and drives it with fetch,
// so middleware -- origin checks, session cookies, cache headers, rate limits --
// is covered exactly as it runs in production. Requiring this module configures
// the environment the app validates at startup, so require it before anything
// that reads config.
//
// Environment already set by the requiring test file wins, which lets a test opt
// into a different mode (e.g. REGISTRATION_OTP_ENABLED) before requiring this.

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
delete process.env.DATABASE_URL;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-1234567890';
process.env.APP_ORIGIN = process.env.APP_ORIGIN || 'http://127.0.0.1';
process.env.SESSION_NAME = process.env.SESSION_NAME || 'borrowfirst.sid';

const createApp = require('../../../server/app');
const { run, close } = require('../../../server/db/connection');
const { hashPassword } = require('../../../server/services/passwordService');

// Captured before any test replaces global.fetch with a stub for outbound calls
// (OTP delivery, Cloudinary); the harness must keep talking to the real socket.
const nativeFetch = global.fetch;

let server = null;
let baseUrl = '';

function getBaseUrl() {
  return baseUrl;
}

function getOrigin() {
  return process.env.APP_ORIGIN;
}

async function startTestServer() {
  const app = await createApp();

  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;
  process.env.APP_ORIGIN = baseUrl;

  return baseUrl;
}

async function stopTestServer() {
  if (!server) {
    await close();
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  server = null;
  await close();
}

async function apiRequest(requestPath, {
  method = 'GET',
  body,
  cookie = '',
  origin = getOrigin(),
  headers = {}
} = {}) {
  const requestHeaders = { ...headers };

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (cookie) {
    requestHeaders.Cookie = cookie;
  }

  if (method !== 'GET' && origin) {
    requestHeaders.Origin = origin;
  }

  const response = await nativeFetch(`${baseUrl}${requestPath}`, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  return { response, payload };
}

function readSessionCookie(response) {
  const setCookie = response.headers.get('set-cookie') || '';
  return setCookie.split(';')[0];
}

// Child rows before parents: the foreign keys added in 005_foreign_keys.sql make
// this ordering load-bearing rather than merely tidy.
async function resetDatabase() {
  await run('DELETE FROM session');
  await run('DELETE FROM account');
  await run('DELETE FROM verification');
  await run('DELETE FROM rate_limits');
  await run('DELETE FROM notifications');
  await run('DELETE FROM pickup_options');
  await run('DELETE FROM product_images');
  await run('DELETE FROM products');
  await run('DELETE FROM ratings');
  await run('DELETE FROM users');
}

async function seedUser({
  username = 'alice',
  fullName = 'Alice Example',
  email = 'alice@upei.ca',
  password = 'StrongPassword123!',
  address = '123 University Avenue',
  phone = '+19025550100',
  country = 'Canada'
} = {}) {
  const result = await run(
    `INSERT INTO users (username, full_name, email, password, address, phone, country, email_verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
     RETURNING id AS "lastID"`,
    [username, fullName, email, hashPassword(password), address, phone, country]
  );

  // A user row alone isn't enough to sign in through Better Auth, which keeps
  // credential passwords on a separate "account" row.
  await run(
    `INSERT INTO account (issuer, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     VALUES ('local:credential', ?, 'credential', ?, ?, NOW(), NOW())`,
    [String(result.lastID), result.lastID, hashPassword(password)]
  );

  return {
    id: result.lastID,
    username,
    fullName,
    email,
    password
  };
}

async function loginAs(user) {
  const { response } = await apiRequest('/api/login', {
    method: 'POST',
    body: { email: user.email, password: user.password }
  });

  return readSessionCookie(response);
}

async function seedProduct({
  lenderId,
  name = 'Test Item',
  description = 'A test item.',
  condition = 'Good',
  imageUrl = '/images/tent.svg',
  price = 10,
  borrowerId = null,
  isActive = 1
}) {
  const result = await run(
    `INSERT INTO products (
      "Product_Name",
      "Product_Lender_ID",
      "Product_Borrower_ID",
      "Product_Is_Active",
      "Product_Description",
      "Product_Condition",
      "Product_Url",
      "Product_Lending_Charge"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING "Product_ID" AS "lastID"`,
    [name, lenderId, borrowerId, isActive, description, condition, imageUrl, price]
  );

  return result.lastID;
}

module.exports = {
  apiRequest,
  getBaseUrl,
  getOrigin,
  loginAs,
  readSessionCookie,
  resetDatabase,
  seedProduct,
  seedUser,
  startTestServer,
  stopTestServer
};
