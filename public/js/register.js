import { getJson, postJson } from './api.js';
import {
  getAddressValidationMessage,
  getCountryValidationMessage,
  getPhoneValidationMessage,
  isValidUpeiEmail,
  redirectTo
} from './helpers.js';

const form = document.getElementById('registerForm');
const authSteps = document.querySelector('.auth-steps');
const detailsStep = document.getElementById('registerDetailsStep');
const verifyStep = document.getElementById('registerVerifyStep');
const fullNameInput = document.getElementById('fullName');
const usernameInput = document.getElementById('username');
const emailInput = document.getElementById('email');
const phoneInput = document.getElementById('phone');
const countryInput = document.getElementById('country');
const addressInput = document.getElementById('address');
const passwordInput = document.getElementById('password');
const otpInput = document.getElementById('otp');
const otpHint = document.getElementById('otpHint');
const backToDetailsButton = document.getElementById('backToDetailsButton');
const detailsStepPill = document.getElementById('detailsStepPill');
const verifyStepPill = document.getElementById('verifyStepPill');
const errorElement = document.getElementById('error');
const registerPageIntro = document.getElementById('registerPageIntro');
const registerHeroSubtitle = document.getElementById('registerHeroSubtitle');
const registerStepTwoCopy = document.getElementById('registerStepTwoCopy');
const sendOtpButton = document.getElementById('sendOtpButton');

let awaitingOtp = false;
let otpRequired = true;
const DISPLAY_NAME_MAX_LENGTH = 40;
const FULL_NAME_MAX_LENGTH = 80;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

function setStepState(isVerificationStep) {
  detailsStepPill?.classList.toggle('is-current', !isVerificationStep);
  verifyStepPill?.classList.toggle('is-current', isVerificationStep);
}

function applyRegisterConfig(config = {}) {
  otpRequired = config.otpRequired !== false;
  authSteps?.classList.toggle('hidden', !otpRequired);
  verifyStepPill?.classList.toggle('hidden', !otpRequired);

  if (sendOtpButton) {
    sendOtpButton.textContent = otpRequired ? 'Continue' : 'Create Account';
  }

  if (!otpRequired) {
    awaitingOtp = false;
    verifyStep.classList.add('hidden');
    detailsStep.classList.remove('hidden');

    if (registerPageIntro) {
      registerPageIntro.textContent = 'Complete your profile to activate your account. Email verification is temporarily disabled.';
    }

    if (registerHeroSubtitle) {
      registerHeroSubtitle.textContent = 'Set up your profile once and start borrowing or lending with a simpler sign-up flow for now.';
    }

    if (registerStepTwoCopy) {
      registerStepTwoCopy.textContent = 'Account setup is completed immediately.';
    }
  }
}

function getRegistrationPayload() {
  return {
    fullName: fullNameInput.value.trim(),
    username: usernameInput.value.trim(),
    email: emailInput.value.trim(),
    phone: phoneInput.value.trim(),
    country: countryInput.value.trim(),
    address: addressInput.value.trim(),
    password: passwordInput.value
  };
}

function showVerificationStep(email) {
  awaitingOtp = true;
  setStepState(true);
  detailsStep.classList.add('hidden');
  verifyStep.classList.remove('hidden');
  otpHint.textContent = `We sent a 6-digit verification code to ${email}.`;
  otpInput.focus();
}

function showDetailsStep() {
  awaitingOtp = false;
  setStepState(false);
  verifyStep.classList.add('hidden');
  detailsStep.classList.remove('hidden');
}

async function handleSendOtp() {
  const payload = getRegistrationPayload();

  if (!payload.fullName) {
    errorElement.textContent = 'Please enter your full name.';
    return;
  }

  if (payload.fullName.length > FULL_NAME_MAX_LENGTH) {
    errorElement.textContent = `Full name must be ${FULL_NAME_MAX_LENGTH} characters or fewer.`;
    return;
  }

  if (!payload.username) {
    errorElement.textContent = 'Please enter a display name.';
    return;
  }

  if (payload.username.length > DISPLAY_NAME_MAX_LENGTH) {
    errorElement.textContent = `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`;
    return;
  }

  if (!isValidUpeiEmail(payload.email)) {
    errorElement.textContent = 'Please use your @upei.ca email address.';
    return;
  }

  const countryMessage = getCountryValidationMessage(payload.country);

  if (countryMessage) {
    errorElement.textContent = countryMessage;
    return;
  }

  const addressMessage = getAddressValidationMessage(payload.address);

  if (addressMessage) {
    errorElement.textContent = addressMessage;
    return;
  }

  const phoneMessage = getPhoneValidationMessage(payload.phone);

  if (phoneMessage) {
    errorElement.textContent = phoneMessage;
    return;
  }

  if (!payload.password || payload.password.length < PASSWORD_MIN_LENGTH) {
    errorElement.textContent = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    return;
  }

  if (payload.password.length > PASSWORD_MAX_LENGTH) {
    errorElement.textContent = `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
    return;
  }

  try {
    const response = await postJson('/api/register/request-otp', payload);
    errorElement.textContent = '';

    if (!response?.requiresVerification) {
      redirectTo('/home');
      return;
    }

    showVerificationStep(payload.email);
  } catch (error) {
    errorElement.textContent = error.message || 'Registration failed.';
  }
}

async function handleVerifyOtp() {
  const email = emailInput.value.trim();
  const otp = otpInput.value.trim();

  if (!/^\d{6}$/.test(otp)) {
    errorElement.textContent = 'Enter the 6-digit verification code.';
    return;
  }

  try {
    await postJson('/api/register/verify-otp', { email, otp });
    redirectTo('/home');
  } catch (error) {
    errorElement.textContent = error.message || 'Verification failed.';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorElement.textContent = '';

  if (awaitingOtp) {
    await handleVerifyOtp();
    return;
  }

  await handleSendOtp();
});

backToDetailsButton.addEventListener('click', () => {
  errorElement.textContent = '';
  showDetailsStep();
});

try {
  applyRegisterConfig(await getJson('/api/register/config'));
} catch (error) {
  applyRegisterConfig({ otpRequired: true });
}
