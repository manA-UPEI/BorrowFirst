const assert = require('node:assert/strict');
const test = require('node:test');

process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
process.env.SESSION_SECRET = 'test-session-secret-1234567890';
process.env.APP_ORIGIN = 'http://127.0.0.1';
process.env.SESSION_NAME = 'borrowfirst.sid';
process.env.REGISTRATION_OTP_ENABLED = 'true';

const createApp = require('../../server/app');
const initializeDatabase = require('../../server/db/init');
const { run, get, close } = require('../../server/db/connection');
const { hashPassword } = require('../../server/services/passwordService');
const { validateEnvironment } = require('../../server');
const nativeFetch = global.fetch;

let server;
let baseUrl;

function getOrigin() {
  return process.env.APP_ORIGIN;
}

async function startServer() {
  const app = await createApp();

  return new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
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

  // Mirrors the one-time backfill in server/db/init.js: a user row alone isn't
  // enough to sign in through Better Auth, which keeps credential passwords on a
  // separate "account" row.
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

test.before(async () => {
  server = await startServer();
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.APP_ORIGIN = baseUrl;
});

test.after(async () => {
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
  await close();
});

test.beforeEach(async () => {
  await resetDatabase();
});

test('validateEnvironment requires SESSION_SECRET and APP_ORIGIN', async () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalOrigin = process.env.APP_ORIGIN;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  process.env.SESSION_SECRET = '';
  assert.throws(() => validateEnvironment(), /SESSION_SECRET/);

  process.env.SESSION_SECRET = originalSecret;
  process.env.APP_ORIGIN = '';
  assert.throws(() => validateEnvironment(), /APP_ORIGIN/);

  process.env.APP_ORIGIN = originalOrigin;
  process.env.NODE_ENV = 'production';
  delete process.env.DATABASE_URL;
  assert.throws(() => validateEnvironment(), /DATABASE_URL/);

  process.env.NODE_ENV = originalNodeEnv;
  process.env.DATABASE_URL = originalDatabaseUrl;
  assert.equal(typeof validateEnvironment(), 'number');
});

test('normal startup removes the legacy default demo account', async () => {
  await initializeDatabase.seedDemoData();

  const before = await get('SELECT id FROM users WHERE email = ?', ['demo@upei.ca']);
  assert.ok(before);

  await initializeDatabase();

  const after = await get('SELECT id FROM users WHERE email = ?', ['demo@upei.ca']);
  assert.equal(after, undefined);
});

test('state-changing API requests require the configured origin and sessions use strict cookies', async () => {
  const user = await seedUser();

  const badOriginResponse = await apiRequest('/api/login', {
    method: 'POST',
    origin: 'http://malicious.example',
    body: {
      email: user.email,
      password: user.password
    }
  });

  assert.equal(badOriginResponse.response.status, 403);
  assert.deepEqual(badOriginResponse.payload, { message: 'Invalid request origin.' });

  const loginResponse = await apiRequest('/api/login', {
    method: 'POST',
    body: {
      email: user.email,
      password: user.password
    }
  });

  assert.equal(loginResponse.response.status, 200);
  const setCookie = loginResponse.response.headers.get('set-cookie') || '';
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);

  const meResponse = await apiRequest('/api/me', {
    cookie: readSessionCookie(loginResponse.response)
  });

  assert.equal(meResponse.response.status, 200);
  assert.equal(meResponse.response.headers.get('cache-control'), 'no-store');
});

test('logout invalidates the session cookie', async () => {
  const user = await seedUser({ email: 'logout-target@upei.ca' });

  const loginResponse = await apiRequest('/api/login', {
    method: 'POST',
    body: { email: user.email, password: user.password }
  });
  const cookie = readSessionCookie(loginResponse.response);

  const meBeforeLogout = await apiRequest('/api/me', { cookie });
  assert.equal(meBeforeLogout.response.status, 200);

  const logoutResponse = await apiRequest('/api/logout', { method: 'POST', cookie });
  assert.equal(logoutResponse.response.status, 200);
  assert.deepEqual(logoutResponse.payload, { success: true });

  const meAfterLogout = await apiRequest('/api/me', { cookie });
  assert.equal(meAfterLogout.response.status, 401);
});

test('OTP requests hide account existence and verification codes lock out after repeated failures', async () => {
  const existingUser = await seedUser({ email: 'member@upei.ca' });
  const originalFetch = global.fetch;
  const originalResendKey = process.env.RESEND_API_KEY;

  process.env.RESEND_API_KEY = 'test-resend-key';
  global.fetch = async () => ({
    ok: true,
    text: async () => '',
    json: async () => ({})
  });

  try {
    const existingResponse = await apiRequest('/api/register/request-otp', {
      method: 'POST',
      body: {
        fullName: 'Member Example',
        username: 'member',
        email: existingUser.email,
        phone: '+19025550111',
        country: 'Canada',
        address: '123 University Avenue',
        password: 'AnotherStrongPass123!'
      }
    });

    const freshResponse = await apiRequest('/api/register/request-otp', {
      method: 'POST',
      body: {
        fullName: 'Fresh User',
        username: 'freshuser',
        email: 'fresh@upei.ca',
        phone: '+19025550112',
        country: 'Canada',
        address: '456 Campus Drive',
        password: 'AnotherStrongPass123!'
      }
    });

    assert.equal(existingResponse.response.status, 200);
    assert.equal(freshResponse.response.status, 200);
    assert.deepEqual(existingResponse.payload, freshResponse.payload);
  } finally {
    process.env.RESEND_API_KEY = originalResendKey;
    global.fetch = originalFetch;
  }

  const otpService = require('../../server/services/otpService');
  const originalSendOtpEmail = otpService.sendOtpEmail;
  let capturedOtp = null;
  otpService.sendOtpEmail = async (email, code) => {
    capturedOtp = code;
    return { deliveryMode: 'email' };
  };

  try {
    const requestResponse = await apiRequest('/api/register/request-otp', {
      method: 'POST',
      body: {
        fullName: 'Otp User',
        username: 'otpuser',
        email: 'otp-user@upei.ca',
        phone: '+19025550113',
        country: 'Canada',
        address: '789 Campus Road',
        password: 'StrongPassword123!'
      }
    });
    assert.equal(requestResponse.response.status, 200);
    assert.ok(capturedOtp);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const verifyResponse = await apiRequest('/api/register/verify-otp', {
        method: 'POST',
        body: {
          email: 'otp-user@upei.ca',
          otp: '000000'
        }
      });

      assert.equal(verifyResponse.response.status, 400);
      assert.deepEqual(verifyResponse.payload, { message: 'Invalid OTP' });
    }

    const lockedOutResponse = await apiRequest('/api/register/verify-otp', {
      method: 'POST',
      body: {
        email: 'otp-user@upei.ca',
        otp: capturedOtp
      }
    });

    assert.equal(lockedOutResponse.response.status, 403);
    assert.deepEqual(lockedOutResponse.payload, { message: 'Too many attempts' });

    // Unlike the legacy pending_registrations flow, Better Auth creates the user
    // row up front and gates sign-in on emailVerified, rather than withholding the
    // row until the OTP is confirmed.
    const createdUser = await get('SELECT id, email_verified FROM users WHERE email = ?', ['otp-user@upei.ca']);
    assert.ok(createdUser);
    assert.equal(createdUser.email_verified, false);

    const blockedLogin = await apiRequest('/api/login', {
      method: 'POST',
      body: { email: 'otp-user@upei.ca', password: 'StrongPassword123!' }
    });
    assert.equal(blockedLogin.response.status, 403);
  } finally {
    otpService.sendOtpEmail = originalSendOtpEmail;
  }
});

test('product creation rejects unsafe image URLs', async () => {
  const user = await seedUser({ email: 'lender@upei.ca' });
  const loginResponse = await apiRequest('/api/login', {
    method: 'POST',
    body: {
      email: user.email,
      password: user.password
    }
  });

  const cookie = readSessionCookie(loginResponse.response);
  const productResponse = await apiRequest('/api/products', {
    method: 'POST',
    cookie,
    body: {
      name: 'Unsafe Image Item',
      price: 10,
      condition: 'Good',
      description: 'Testing invalid image URLs.',
      imageUrl: 'https://malicious.example/file.png'
    }
  });

  assert.equal(productResponse.response.status, 400);
  assert.deepEqual(productResponse.payload, {
    message: 'Only PNG, JPEG, WebP, and GIF images up to 1 MiB are allowed'
  });
});

test('counterpart profile responses redact private contact fields', async () => {
  const lender = await seedUser({
    username: 'lender',
    fullName: 'Lender Example',
    email: 'lender@upei.ca'
  });
  const borrower = await seedUser({
    username: 'borrower',
    fullName: 'Borrower Example',
    email: 'borrower@upei.ca',
    phone: '+19025550114',
    address: '321 Hidden Lane',
    country: 'Canada'
  });

  const productResult = await run(
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
    [
      'Campus Laptop',
      lender.id,
      borrower.id,
      1,
      'Shared laptop',
      'Good',
      '/images/laptop.jpeg',
      18
    ]
  );

  await run(
    `INSERT INTO notifications (
      product_id,
      lender_id,
      borrower_id,
      pickup_option,
      pickup_meetup_at,
      due_date,
      status,
      approved_at,
      picked_up_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      productResult.lastID,
      lender.id,
      borrower.id,
      1,
      new Date(Date.now() + 60_000).toISOString(),
      '2099-12-31',
      'active',
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );

  const loginResponse = await apiRequest('/api/login', {
    method: 'POST',
    body: {
      email: lender.email,
      password: lender.password
    }
  });

  const profileResponse = await apiRequest(`/api/users/${borrower.id}/profile`, {
    cookie: readSessionCookie(loginResponse.response)
  });

  assert.equal(profileResponse.response.status, 200);
  assert.equal(profileResponse.payload.user.email, undefined);
  assert.equal(profileResponse.payload.user.phone, undefined);
  assert.equal(profileResponse.payload.user.address, undefined);
  assert.equal(profileResponse.payload.user.country, undefined);
  assert.equal(profileResponse.payload.user.full_name, 'Borrower Example');
});

test('password reset hides account existence, requires a valid OTP, and lets the new password sign in', async () => {
  const user = await seedUser({ email: 'reset-target@upei.ca', password: 'OriginalPassword123!' });

  // Mocked up front, before any request is made: the known-email case below
  // triggers a real send attempt, and this suite shouldn't depend on (or wait
  // out) a real network call to an email provider to get a deterministic result.
  const otpService = require('../../server/services/otpService');
  const originalSendOtpEmail = otpService.sendOtpEmail;
  let capturedOtp = null;
  otpService.sendOtpEmail = async (email, code) => {
    capturedOtp = code;
    return { deliveryMode: 'email' };
  };

  try {
    const unknownEmailResponse = await apiRequest('/api/password/forgot', {
      method: 'POST',
      body: { email: 'nobody-here@upei.ca' }
    });
    const knownEmailResponse = await apiRequest('/api/password/forgot', {
      method: 'POST',
      body: { email: user.email }
    });

    assert.equal(unknownEmailResponse.response.status, 200);
    assert.equal(knownEmailResponse.response.status, 200);
    assert.deepEqual(unknownEmailResponse.payload, knownEmailResponse.payload);
    assert.ok(capturedOtp);

    const wrongOtpResponse = await apiRequest('/api/password/reset', {
      method: 'POST',
      body: { email: user.email, otp: '000000', password: 'BrandNewPassword456!' }
    });
    assert.equal(wrongOtpResponse.response.status, 400);

    const stillOldPassword = await apiRequest('/api/login', {
      method: 'POST',
      body: { email: user.email, password: user.password }
    });
    assert.equal(stillOldPassword.response.status, 200);

    const resetResponse = await apiRequest('/api/password/reset', {
      method: 'POST',
      body: { email: user.email, otp: capturedOtp, password: 'BrandNewPassword456!' }
    });
    assert.equal(resetResponse.response.status, 200);
    assert.deepEqual(resetResponse.payload, { success: true });

    const oldPasswordLogin = await apiRequest('/api/login', {
      method: 'POST',
      body: { email: user.email, password: user.password }
    });
    assert.equal(oldPasswordLogin.response.status, 401);

    const newPasswordLogin = await apiRequest('/api/login', {
      method: 'POST',
      body: { email: user.email, password: 'BrandNewPassword456!' }
    });
    assert.equal(newPasswordLogin.response.status, 200);
  } finally {
    otpService.sendOtpEmail = originalSendOtpEmail;
  }
});
