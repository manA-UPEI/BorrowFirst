import { postJson } from './api.js';
import { redirectTo } from './format.mjs';
import { isValidUpeiEmail } from './validate.mjs';

const form = document.getElementById('resetPasswordForm');
const requestStep = document.getElementById('requestStep');
const resetStep = document.getElementById('resetStep');
const emailInput = document.getElementById('email');
const otpInput = document.getElementById('otp');
const passwordInput = document.getElementById('password');
const resetOtpHint = document.getElementById('resetOtpHint');
const backToRequestButton = document.getElementById('backToRequestButton');
const requestStepPill = document.getElementById('requestStepPill');
const resetStepPill = document.getElementById('resetStepPill');
const errorElement = document.getElementById('error');
const successElement = document.getElementById('success');

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

let awaitingReset = false;

function setStepState(isResetStep) {
  requestStepPill.classList.toggle('is-current', !isResetStep);
  resetStepPill.classList.toggle('is-current', isResetStep);
}

function showResetStep(email) {
  awaitingReset = true;
  setStepState(true);
  requestStep.classList.add('hidden');
  resetStep.classList.remove('hidden');
  resetOtpHint.textContent = `We sent a 6-digit verification code to ${email}.`;
  otpInput.focus();
}

function showRequestStep() {
  awaitingReset = false;
  setStepState(false);
  resetStep.classList.add('hidden');
  requestStep.classList.remove('hidden');
}

async function handleRequestOtp() {
  const email = emailInput.value.trim();

  if (!isValidUpeiEmail(email)) {
    errorElement.textContent = 'Please use your @upei.ca email address.';
    return;
  }

  try {
    await postJson('/api/password/forgot', { email });
    errorElement.textContent = '';
    showResetStep(email);
  } catch (error) {
    errorElement.textContent = error.message || 'Unable to send verification code.';
  }
}

async function handleConfirmReset() {
  const email = emailInput.value.trim();
  const otp = otpInput.value.trim();
  const password = passwordInput.value;

  if (!/^\d{6}$/.test(otp)) {
    errorElement.textContent = 'Enter the 6-digit verification code.';
    return;
  }

  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    errorElement.textContent = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    return;
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    errorElement.textContent = `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
    return;
  }

  try {
    await postJson('/api/password/reset', { email, otp, password });
    errorElement.textContent = '';
    successElement.textContent = 'Password updated. Redirecting to login...';
    successElement.classList.remove('hidden');
    setTimeout(() => redirectTo('/login'), 1500);
  } catch (error) {
    errorElement.textContent = error.message || 'Unable to reset password.';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorElement.textContent = '';

  if (awaitingReset) {
    await handleConfirmReset();
    return;
  }

  await handleRequestOtp();
});

backToRequestButton.addEventListener('click', () => {
  errorElement.textContent = '';
  showRequestStep();
});
