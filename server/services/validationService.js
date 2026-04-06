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
