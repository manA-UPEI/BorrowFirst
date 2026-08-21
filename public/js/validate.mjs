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

export function getPickupMeetupValidationMessage(value, startTime, endTime, dueDate, startDate) {
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
    return 'Return date must be on or after the pickup meetup date.';
  }

  // The handover starts the loan, so it has to happen on the first booked day.
  // Mirrors the same rule on the server (createBorrowRequest validatePickupMeetup).
  if (typeof startDate === 'string' && startDate && startDate !== getDateTimeDatePart(value)) {
    return 'Pickup meetup must be on the first day of your booking.';
  }

  return '';
}

/**
 * Client-side mirror of the booking rules in
 * src/domain/booking/availability.mts. The server stays authoritative -- this
 * exists so a borrower sees why a range is unavailable before submitting.
 */
export function getBookingRangeValidationMessage(startDate, endDate, {
  windows = [],
  unavailableRanges = [],
  maxLoanDays = 0,
  today = ''
} = {}) {
  if (!isValidDateOnlyValue(startDate)) {
    return 'Please choose a valid start date.';
  }

  if (!isValidDateOnlyValue(endDate)) {
    return 'Please choose a valid return date.';
  }

  if (endDate < startDate) {
    return 'Return date must be on or after the start date.';
  }

  if (today && startDate < today) {
    return 'Start date cannot be in the past.';
  }

  if (maxLoanDays) {
    const days = Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000
    ) + 1;

    if (days > maxLoanDays) {
      return `Loans are limited to ${maxLoanDays} days.`;
    }
  }

  const offered = windows.filter((window) => window.kind === 'available');

  if (offered.length && !offered.some((window) => (
    window.startDate <= startDate && window.endDate >= endDate
  ))) {
    return 'That range falls outside the dates this item is offered.';
  }

  const clash = unavailableRanges.find((range) => (
    range.startDate <= endDate && startDate <= range.endDate
  ));

  if (clash) {
    return `Those dates are unavailable (${clash.startDate} to ${clash.endDate}).`;
  }

  return '';
}

function isValidDateOnlyValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
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
