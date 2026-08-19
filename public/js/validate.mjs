/* Client-side validation. Mirrors the server rules so users get fast
   feedback; the server remains the authority. */

import {
  getDateTimeDatePart,
  getDateTimeMinutes,
  isFutureDateTimeLocal,
  isValidDateTimeLocal,
  parsePickupWindowMinutes
} from './format.mjs';

const PLACEHOLDER_ADDRESSES = new Set(['n/a', 'na', 'none', 'unknown', 'test', 'tbd']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function isValidUpeiEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith('@upei.ca');
}

export function normalizePhoneNumber(phone) {
  const rawPhone = typeof phone === 'string' ? phone.trim() : '';

  if (!rawPhone || !/^[+\d().\-\s]+$/.test(rawPhone)) {
    return '';
  }

  const compactPhone = rawPhone.replace(/[().\-\s]/g, '');
  const plusMatches = compactPhone.match(/\+/g) || [];

  if (plusMatches.length > 1 || (compactPhone.includes('+') && !compactPhone.startsWith('+'))) {
    return '';
  }

  if (compactPhone.startsWith('+')) {
    return /^\+\d{10,15}$/.test(compactPhone) ? compactPhone : '';
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

export function getPhoneValidationMessage(phone) {
  return normalizePhoneNumber(phone) ? '' : 'Please enter a valid phone number.';
}

export function getCountryValidationMessage(country) {
  const normalizedCountry = normalizeText(country);

  if (!normalizedCountry) {
    return 'Country is required.';
  }

  if (!/^[A-Za-z][A-Za-z\s'.-]{1,59}$/.test(normalizedCountry)) {
    return 'Please enter a valid country.';
  }

  return '';
}

export function getAddressValidationMessage(address) {
  const normalizedAddress = normalizeText(address);

  if (!normalizedAddress) {
    return 'Address is required.';
  }

  if (PLACEHOLDER_ADDRESSES.has(normalizedAddress.toLowerCase())) {
    return 'Please enter a valid street address.';
  }

  if (normalizedAddress.length < 10) {
    return 'Please enter a complete street address.';
  }

  if (normalizedAddress.length > 200) {
    return 'Address is too long.';
  }

  if (!/\d/.test(normalizedAddress)) {
    return 'Address must include a street number.';
  }

  if ((normalizedAddress.match(/[A-Za-z]/g) || []).length < 5) {
    return 'Please enter a valid street address.';
  }

  if (normalizedAddress.split(/\s+/).filter(Boolean).length < 3) {
    return 'Please enter a complete street address.';
  }

  return '';
}

export function getPickupMeetupValidationMessage(value, startTime, endTime, dueDate) {
  if (!isValidDateTimeLocal(value)) {
    return 'Please choose a valid pickup meetup date and time.';
  }

  if (!isFutureDateTimeLocal(value)) {
    return 'Pickup meetup must be in the future.';
  }

  const startMinutes = parsePickupWindowMinutes(startTime);
  const endMinutes = parsePickupWindowMinutes(endTime);
  const meetupMinutes = getDateTimeMinutes(value);

  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || Number.isNaN(meetupMinutes)) {
    return 'The selected pickup window is unavailable.';
  }

  if (meetupMinutes < startMinutes || meetupMinutes > endMinutes) {
    return `Pickup meetup must be between ${startTime} and ${endTime}.`;
  }

  if (typeof dueDate === 'string' && dueDate && dueDate < getDateTimeDatePart(value)) {
    return 'Due date must be on or after the pickup meetup date.';
  }

  return '';
}

export function getReturnMeetupValidationMessage(value) {
  if (!isValidDateTimeLocal(value)) {
    return 'Please choose a valid return meetup date and time.';
  }

  if (!isFutureDateTimeLocal(value)) {
    return 'Return meetup must be in the future.';
  }

  return '';
}
