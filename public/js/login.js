import { postJson } from './api.js';
import { isValidUpeiEmail, redirectTo } from './helpers.js';

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorElement = document.getElementById('error');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorElement.textContent = '';

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!isValidUpeiEmail(email)) {
    errorElement.textContent = 'Please use your @upei.ca email address.';
    return;
  }

  if (!password) {
    errorElement.textContent = 'Password is required.';
    return;
  }

  try {
    await postJson('/api/login', { email, password });
    redirectTo('/home');
  } catch (error) {
    errorElement.textContent = error.message || 'Login failed.';
  }
});
