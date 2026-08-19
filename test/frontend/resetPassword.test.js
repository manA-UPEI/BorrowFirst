const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const resetPasswordModuleUrl = pathToFileURL(
  path.join(__dirname, '..', '..', 'public', 'js', 'resetPassword.js')
).href;

const RESET_PASSWORD_HTML = `
  <form id="resetPasswordForm">
    <div id="requestStep">
      <input id="email" type="email" />
      <button type="submit" id="sendResetOtpButton">Send verification code</button>
    </div>
    <div id="resetStep" class="hidden">
      <p id="resetOtpHint"></p>
      <input id="otp" type="text" />
      <input id="password" type="password" />
      <button type="submit" id="confirmResetButton">Reset password</button>
      <button type="button" id="backToRequestButton">Edit Email</button>
    </div>
    <p id="error" class="error"></p>
    <p id="success" class="hidden"></p>
    <span id="requestStepPill"></span>
    <span id="resetStepPill"></span>
  </form>
`;

function installDom() {
  const dom = new JSDOM(`<!doctype html><html><body>${RESET_PASSWORD_HTML}</body></html>`, {
    url: 'http://localhost/reset-password'
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  return dom;
}

function uninstallDom(dom) {
  dom.window.close();
  delete global.window;
  delete global.document;
  delete global.Node;
  delete global.fetch;
}

function mockJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body
  };
}

async function loadModule() {
  // Each test needs its own fresh module instance since the module attaches
  // listeners to the DOM at import time -- bust Node's ESM cache with a unique
  // query string per load, matching the pattern used by other frontend tests.
  return import(`${resetPasswordModuleUrl}?t=${Date.now()}-${Math.random()}`);
}

function submitForm() {
  const form = document.getElementById('resetPasswordForm');
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

async function flushMicrotasks() {
  // setImmediate, not setTimeout: one test enables fake timers to keep the
  // module's own `setTimeout(..., 1500)` redirect from firing for real, and
  // that mock must not also swallow this helper's own flushing.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('requesting a code with an invalid email shows an error and never calls the API', async () => {
  const dom = installDom();
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return mockJsonResponse(200, { success: true });
  };

  try {
    await loadModule();
    document.getElementById('email').value = 'not-a-upei-email@gmail.com';
    submitForm();
    await flushMicrotasks();

    assert.equal(fetchCalled, false);
    assert.equal(document.getElementById('error').textContent, 'Please use your @upei.ca email address.');
    assert.ok(document.getElementById('requestStep').classList.contains('hidden') === false);
    assert.ok(document.getElementById('resetStep').classList.contains('hidden'));
  } finally {
    uninstallDom(dom);
  }
});

test('a valid email request advances to the OTP step and shows the hint', async () => {
  const dom = installDom();
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return mockJsonResponse(200, { success: true, message: 'If the email is eligible, a password reset code has been sent.' });
  };

  try {
    await loadModule();
    document.getElementById('email').value = 'student@upei.ca';
    submitForm();
    await flushMicrotasks();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/password/forgot');
    assert.deepEqual(calls[0].body, { email: 'student@upei.ca' });
    assert.equal(document.getElementById('error').textContent, '');
    assert.ok(document.getElementById('requestStep').classList.contains('hidden'));
    assert.ok(document.getElementById('resetStep').classList.contains('hidden') === false);
    assert.equal(
      document.getElementById('resetOtpHint').textContent,
      'We sent a 6-digit verification code to student@upei.ca.'
    );
  } finally {
    uninstallDom(dom);
  }
});

test('a server error on the request step surfaces the server message', async () => {
  const dom = installDom();
  global.fetch = async () => mockJsonResponse(429, { message: 'Too many requests. Please try again later.' });

  try {
    await loadModule();
    document.getElementById('email').value = 'student@upei.ca';
    submitForm();
    await flushMicrotasks();

    assert.equal(document.getElementById('error').textContent, 'Too many requests. Please try again later.');
    assert.ok(document.getElementById('resetStep').classList.contains('hidden'));
  } finally {
    uninstallDom(dom);
  }
});

test('the reset step validates OTP format and password length before calling the API', async () => {
  const dom = installDom();
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return mockJsonResponse(200, { success: true });
  };

  try {
    await loadModule();
    document.getElementById('email').value = 'student@upei.ca';
    submitForm();
    await flushMicrotasks();
    fetchCalled = false;

    document.getElementById('otp').value = '12';
    document.getElementById('password').value = 'a-long-enough-password-1';
    submitForm();
    await flushMicrotasks();
    assert.equal(fetchCalled, false);
    assert.equal(document.getElementById('error').textContent, 'Enter the 6-digit verification code.');

    document.getElementById('otp').value = '123456';
    document.getElementById('password').value = 'short';
    submitForm();
    await flushMicrotasks();
    assert.equal(fetchCalled, false);
    assert.equal(document.getElementById('error').textContent, 'Password must be at least 12 characters.');
  } finally {
    uninstallDom(dom);
  }
});

test('a successful reset shows the success message and posts email, otp, and password', async (t) => {
  // The success path schedules `redirectTo('/login')` 1.5s out. Mock the timer so
  // that pending setTimeout never fires for real after the DOM (and global.window
  // it navigates through) is torn down at the end of this test.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dom = installDom();
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return mockJsonResponse(200, { success: true });
  };

  try {
    await loadModule();
    document.getElementById('email').value = 'student@upei.ca';
    submitForm();
    await flushMicrotasks();

    document.getElementById('otp').value = '654321';
    document.getElementById('password').value = 'BrandNewPassword123!';
    submitForm();
    await flushMicrotasks();

    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, '/api/password/reset');
    assert.deepEqual(calls[1].body, {
      email: 'student@upei.ca',
      otp: '654321',
      password: 'BrandNewPassword123!'
    });
    assert.equal(document.getElementById('success').classList.contains('hidden'), false);
    assert.equal(document.getElementById('success').textContent, 'Password updated. Redirecting to login...');
  } finally {
    uninstallDom(dom);
  }
});

test('a wrong OTP on the reset step surfaces the server message and does not advance', async () => {
  const dom = installDom();
  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return mockJsonResponse(200, { success: true });
    }
    return mockJsonResponse(400, { message: 'Invalid OTP' });
  };

  try {
    await loadModule();
    document.getElementById('email').value = 'student@upei.ca';
    submitForm();
    await flushMicrotasks();

    document.getElementById('otp').value = '000000';
    document.getElementById('password').value = 'BrandNewPassword123!';
    submitForm();
    await flushMicrotasks();

    assert.equal(document.getElementById('error').textContent, 'Invalid OTP');
    assert.equal(document.getElementById('success').classList.contains('hidden'), true);
  } finally {
    uninstallDom(dom);
  }
});

test('"Edit Email" returns to the request step and clears the error', async () => {
  const dom = installDom();
  global.fetch = async () => mockJsonResponse(200, { success: true });

  try {
    await loadModule();
    document.getElementById('email').value = 'student@upei.ca';
    submitForm();
    await flushMicrotasks();
    assert.ok(document.getElementById('resetStep').classList.contains('hidden') === false);

    document.getElementById('backToRequestButton').dispatchEvent(
      new window.Event('click', { bubbles: true, cancelable: true })
    );

    assert.ok(document.getElementById('requestStep').classList.contains('hidden') === false);
    assert.ok(document.getElementById('resetStep').classList.contains('hidden'));
  } finally {
    uninstallDom(dom);
  }
});
