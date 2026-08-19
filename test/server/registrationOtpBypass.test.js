const assert = require('node:assert/strict');
const test = require('node:test');

process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
process.env.SESSION_SECRET = 'test-session-secret-1234567890';
process.env.APP_ORIGIN = 'http://127.0.0.1';
process.env.SESSION_NAME = 'borrowfirst.sid';
// Better Auth reads this once, at module load, into a static
// requireEmailVerification setting (see src/infrastructure/auth/betterAuth.mts) --
// unlike the legacy flow, it can't be toggled per request. This test needs its own
// process/module instance with the flag already off, which is why it lives in its
// own file rather than alongside security.test.js's other registration tests.
process.env.REGISTRATION_OTP_ENABLED = 'false';

const createApp = require('../../server/app');
const { get, close } = require('../../server/db/connection');

let server;
let baseUrl;

async function startServer() {
  const app = await createApp();

  return new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
}

async function apiRequest(requestPath, { method = 'GET', body, cookie = '', origin = process.env.APP_ORIGIN } = {}) {
  const requestHeaders = {};

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (cookie) {
    requestHeaders.Cookie = cookie;
  }

  if (method !== 'GET' && origin) {
    requestHeaders.Origin = origin;
  }

  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  return { response, payload };
}

function readSessionCookie(response) {
  const setCookie = response.headers.get('set-cookie') || '';
  return setCookie.split(';')[0];
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
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await close();
});

test('registration can create an account immediately when OTP is disabled', async () => {
  const registerResponse = await apiRequest('/api/register/request-otp', {
    method: 'POST',
    body: {
      fullName: 'Direct Signup',
      username: 'directsignup',
      email: 'directsignup@upei.ca',
      phone: '+19025550115',
      country: 'Canada',
      address: '654 Campus Avenue',
      password: 'AnotherStrongPass123!'
    }
  });

  assert.equal(registerResponse.response.status, 200);
  assert.deepEqual(registerResponse.payload, {
    success: true,
    requiresVerification: false,
    message: 'Account created.'
  });

  const cookie = readSessionCookie(registerResponse.response);
  const meResponse = await apiRequest('/api/me', { cookie });
  const createdUser = await get('SELECT id, email_verified FROM users WHERE email = ?', ['directsignup@upei.ca']);

  assert.ok(cookie);
  assert.equal(meResponse.response.status, 200);
  assert.equal(meResponse.payload.email, 'directsignup@upei.ca');
  assert.ok(createdUser);
  assert.equal(createdUser.email_verified, false);
});
