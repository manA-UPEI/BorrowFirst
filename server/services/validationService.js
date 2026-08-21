const {
  normalizeProductImageUrl,
  resolveProductImageUrl
} = require('./imageService');

const USERNAME_MAX_LENGTH = 40;
const FULL_NAME_MAX_LENGTH = 80;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const PRODUCT_NAME_MAX_LENGTH = 100;
const PRODUCT_DESCRIPTION_MAX_LENGTH = 1000;
const ALLOWED_PRODUCT_CONDITIONS = new Set(['Excellent', 'Good', 'Fair']);
const PICKUP_LOCATION_MAX_LENGTH = 80;
const MAX_PICKUP_WINDOWS = 5;
const MAX_AVAILABILITY_WINDOWS = 20;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function normalizeCollapsedText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeMultilineText(value) {
  return typeof value === 'string' ? value.trim().replace(/\r\n/g, '\n') : '';
}

function normalizeAddress(address) {
  return normalizeCollapsedText(address);
}

function normalizeCountry(country) {
  return normalizeCollapsedText(country);
}

function normalizePhoneNumber(phone) {
  const rawPhone = typeof phone === 'string' ? phone.trim() : '';

  if (!rawPhone) {
    return '';
  }

  if (!/^[+\d().\-\s]+$/.test(rawPhone)) {
    return '';
  }

  const compactPhone = rawPhone.replace(/[().\-\s]/g, '');
  const plusMatches = compactPhone.match(/\+/g) || [];

  if (plusMatches.length > 1 || (compactPhone.includes('+') && !compactPhone.startsWith('+'))) {
    return '';
  }

  if (compactPhone.startsWith('+')) {
    const internationalDigits = compactPhone.slice(1);

    if (!/^\d{10,15}$/.test(internationalDigits)) {
      return '';
    }

    return `+${internationalDigits}`;
  }

  if (!/^\d+$/.test(compactPhone)) {
    return '';
  }

  if (compactPhone.length === 10) {
    return `+1${compactPhone}`;
  }

  if (compactPhone.length === 11 && compactPhone.startsWith('1')) {
    return `+${compactPhone}`;
  }

  return '';
}

function isValidUpeiEmail(email) {
  return normalizeEmail(email).endsWith('@upei.ca');
}

function validateDisplayName(username) {
  if (!username) {
    return 'Display name is required';
  }

  if (username.length > USERNAME_MAX_LENGTH) {
    return `Display name must be ${USERNAME_MAX_LENGTH} characters or fewer`;
  }

  return '';
}

function validateFullName(fullName) {
  if (!fullName) {
    return 'Full name is required';
  }

  if (fullName.length > FULL_NAME_MAX_LENGTH) {
    return `Full name must be ${FULL_NAME_MAX_LENGTH} characters or fewer`;
  }

  return '';
}

function validatePassword(password) {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`;
  }

  return '';
}

function validateCountry(country) {
  if (!country) {
    return 'Country is required';
  }

  if (!/^[A-Za-z][A-Za-z\s'.-]{1,59}$/.test(country)) {
    return 'Enter a valid country';
  }

  return '';
}

function validateAddress(address) {
  const normalizedAddress = normalizeAddress(address);
  const placeholderValues = new Set(['n/a', 'na', 'none', 'unknown', 'test', 'tbd']);

  if (!normalizedAddress) {
    return 'Address is required';
  }

  if (placeholderValues.has(normalizedAddress.toLowerCase())) {
    return 'Enter a valid street address';
  }

  if (normalizedAddress.length < 10) {
    return 'Enter a complete street address';
  }

  if (normalizedAddress.length > 200) {
    return 'Address is too long';
  }

  if (!/\d/.test(normalizedAddress)) {
    return 'Address must include a street number';
  }

  if ((normalizedAddress.match(/[A-Za-z]/g) || []).length < 5) {
    return 'Enter a valid street address';
  }

  if (normalizedAddress.split(/\s+/).filter(Boolean).length < 3) {
    return 'Enter a complete street address';
  }

  return '';
}

function getValidatedContactFields({ address, phone, country }) {
  const normalizedAddress = normalizeAddress(address);
  const normalizedCountry = normalizeCountry(country);
  const normalizedPhone = normalizePhoneNumber(phone);

  const countryMessage = validateCountry(normalizedCountry);

  if (countryMessage) {
    return { message: countryMessage };
  }

  const addressMessage = validateAddress(normalizedAddress);

  if (addressMessage) {
    return { message: addressMessage };
  }

  if (!normalizedPhone) {
    return { message: 'Enter a valid phone number' };
  }

  return {
    message: '',
    address: normalizedAddress,
    phone: normalizedPhone,
    country: normalizedCountry
  };
}

function validateRegistrationFields({ username, fullName, email, password }) {
  if (!isValidUpeiEmail(email)) {
    return 'Email must end with @upei.ca';
  }

  const displayNameMessage = validateDisplayName(username);

  if (displayNameMessage) {
    return displayNameMessage;
  }

  const fullNameMessage = validateFullName(fullName);

  if (fullNameMessage) {
    return fullNameMessage;
  }

  return validatePassword(password);
}

function validateProductName(name) {
  if (!name) {
    return 'Product name is required';
  }

  if (name.length > PRODUCT_NAME_MAX_LENGTH) {
    return `Product name must be ${PRODUCT_NAME_MAX_LENGTH} characters or fewer`;
  }

  return '';
}

function validateProductDescription(description) {
  if (description.length > PRODUCT_DESCRIPTION_MAX_LENGTH) {
    return `Description must be ${PRODUCT_DESCRIPTION_MAX_LENGTH} characters or fewer`;
  }

  return '';
}

function normalizeProductCondition(condition) {
  const normalizedCondition = normalizeCollapsedText(condition);
  return normalizedCondition || 'Good';
}

function validateProductCondition(condition) {
  if (!ALLOWED_PRODUCT_CONDITIONS.has(condition)) {
    return 'Condition must be Excellent, Good, or Fair';
  }

  return '';
}

// Multipart form parts arrive as strings, JSON bodies as arrays. Accept either so
// the listing form can post images and structured fields in one request.
function parseStructuredList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

// The pickup/meetup validators downstream parse "hh:mm AM" (see
// createBorrowRequest parseTime), but a browser time input submits 24-hour
// "HH:MM". Normalize here so storage keeps one format.
function formatTimeLabel(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return '';
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || hours < 0 || hours > 23) {
    return '';
  }

  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return '';
  }

  const suffix = hours < 12 ? 'AM' : 'PM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;

  return `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function toMinutes(label) {
  const match = label.match(/^(\d{2}):(\d{2}) (AM|PM)$/);
  let hours = Number(match[1]) % 12;

  if (match[3] === 'PM') {
    hours += 12;
  }

  return hours * 60 + Number(match[2]);
}

function getValidatedPickupWindows(value) {
  const entries = parseStructuredList(value);

  if (entries === null) {
    return { message: 'Pickup windows are invalid' };
  }

  if (!entries.length) {
    return { message: '', pickupWindows: [] };
  }

  if (entries.length > MAX_PICKUP_WINDOWS) {
    return { message: `Add at most ${MAX_PICKUP_WINDOWS} pickup windows` };
  }

  const pickupWindows = [];

  for (const entry of entries) {
    const location = normalizeCollapsedText(entry?.location);

    if (!location) {
      return { message: 'Every pickup window needs a location' };
    }

    if (location.length > PICKUP_LOCATION_MAX_LENGTH) {
      return { message: `Pickup location must be ${PICKUP_LOCATION_MAX_LENGTH} characters or fewer` };
    }

    const startTime = formatTimeLabel(entry?.startTime);
    const endTime = formatTimeLabel(entry?.endTime);

    if (!startTime || !endTime) {
      return { message: 'Pickup window times must look like 09:00' };
    }

    if (toMinutes(endTime) <= toMinutes(startTime)) {
      return { message: 'Pickup window must end after it starts' };
    }

    pickupWindows.push({ location, startTime, endTime });
  }

  return { message: '', pickupWindows };
}

function getValidatedAvailability(value) {
  const entries = parseStructuredList(value);

  if (entries === null) {
    return { message: 'Availability dates are invalid' };
  }

  if (!entries.length) {
    return { message: '', availability: [] };
  }

  if (entries.length > MAX_AVAILABILITY_WINDOWS) {
    return { message: `Add at most ${MAX_AVAILABILITY_WINDOWS} availability ranges` };
  }

  const availability = [];

  for (const entry of entries) {
    const kind = entry?.kind === 'blackout' ? 'blackout' : 'available';
    const startDate = typeof entry?.startDate === 'string' ? entry.startDate.trim() : '';
    const endDate = typeof entry?.endDate === 'string' ? entry.endDate.trim() : '';

    if (!isValidDateOnly(startDate) || !isValidDateOnly(endDate)) {
      return { message: 'Availability dates must look like 2026-03-01' };
    }

    if (endDate < startDate) {
      return { message: 'Availability range must end on or after it starts' };
    }

    availability.push({ kind, startDate, endDate });
  }

  if (!availability.some((entry) => entry.kind === 'available')
    && availability.some((entry) => entry.kind === 'blackout')) {
    return { message: 'Add an availability range before blocking dates out of it' };
  }

  return { message: '', availability };
}

function getValidatedProductFields({ name, description, condition, price, imageUrl }) {
  const normalizedName = normalizeCollapsedText(name);
  const normalizedDescription = normalizeMultilineText(description);
  const normalizedCondition = normalizeProductCondition(condition);
  const normalizedImageUrl = normalizeProductImageUrl(imageUrl);
  const parsedPrice = Number(price);

  const nameMessage = validateProductName(normalizedName);

  if (nameMessage) {
    return { message: nameMessage };
  }

  const descriptionMessage = validateProductDescription(normalizedDescription);

  if (descriptionMessage) {
    return { message: descriptionMessage };
  }

  const conditionMessage = validateProductCondition(normalizedCondition);

  if (conditionMessage) {
    return { message: conditionMessage };
  }

  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    return { message: 'Price must be a non-negative number' };
  }

  if (typeof imageUrl === 'string' && imageUrl.trim() && !normalizedImageUrl) {
    return { message: 'Only PNG, JPEG, WebP, and GIF images up to 1 MiB are allowed' };
  }

  return {
    message: '',
    name: normalizedName,
    description: normalizedDescription,
    condition: normalizedCondition,
    price: Math.round(parsedPrice),
    imageUrl: resolveProductImageUrl(normalizedImageUrl)
  };
}

function getValidatedProductCoverIndex(value, imageCount) {
  if (value === undefined || value === null || value === '') {
    return { message: '', coverIndex: 0 };
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 0 || parsedValue >= imageCount) {
    return { message: 'Please choose a valid cover image.' };
  }

  return { message: '', coverIndex: parsedValue };
}

module.exports = {
  USERNAME_MAX_LENGTH,
  FULL_NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  ALLOWED_PRODUCT_CONDITIONS,
  MAX_PICKUP_WINDOWS,
  MAX_AVAILABILITY_WINDOWS,
  formatTimeLabel,
  getValidatedPickupWindows,
  getValidatedAvailability,
  normalizeEmail,
  normalizeCollapsedText,
  normalizeMultilineText,
  normalizeAddress,
  normalizeCountry,
  normalizePhoneNumber,
  isValidUpeiEmail,
  validateDisplayName,
  validateFullName,
  validatePassword,
  validateRegistrationFields,
  getValidatedContactFields,
  getValidatedProductFields,
  getValidatedProductCoverIndex
};
