/* Value formatting and URL helpers. No DOM, no network. */

// --- Location -------------------------------------------------------

export function redirectTo(path) {
  window.location.href = path;
}

export function getRouteId() {
  return window.location.pathname.split('/').pop();
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function getUserProfilePath(userId, interactionId = null) {
  const parsedId = Number(userId);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return '/profile';
  }

  const params = new URLSearchParams({ user: String(parsedId) });
  const parsedInteractionId = Number(interactionId);

  if (Number.isInteger(parsedInteractionId) && parsedInteractionId > 0) {
    params.set('interaction', String(parsedInteractionId));
  }

  return `/profile?${params.toString()}`;
}

// --- Money ----------------------------------------------------------

export function formatPrice(amount) {
  return `$${amount}/day`;
}

export function formatCurrency(amount) {
  const normalizedAmount = Number(amount);

  if (!Number.isFinite(normalizedAmount)) {
    return '$0';
  }

  return `$${normalizedAmount.toFixed(0)}`;
}

// --- Date input values ----------------------------------------------

export function getTodayDateValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getCurrentDateTimeLocalValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function getDateTimeDatePart(value) {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

export function isValidDateTimeLocal(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  const parsedDate = new Date(year, month - 1, day, hours, minutes);

  return parsedDate.getFullYear() === year
    && parsedDate.getMonth() === month - 1
    && parsedDate.getDate() === day
    && parsedDate.getHours() === hours
    && parsedDate.getMinutes() === minutes;
}

export function isFutureDateTimeLocal(value, referenceDate = new Date()) {
  if (!isValidDateTimeLocal(value)) {
    return false;
  }

  return new Date(value).getTime() > referenceDate.getTime();
}

export function formatDateTimeInputValue(value) {
  if (isValidDateTimeLocal(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  const parsedDate = new Date(value.replace(' ', 'T'));

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return getCurrentDateTimeLocalValue(parsedDate);
}

export function getDateTimeMinutes(value) {
  if (!isValidDateTimeLocal(value)) {
    return Number.NaN;
  }

  const [hours, minutes] = value.slice(11, 16).split(':').map(Number);
  return (hours * 60) + minutes;
}

/** Parses a "3:30 PM" pickup-window label into minutes past midnight. */
export function parsePickupWindowMinutes(label) {
  if (typeof label !== 'string') {
    return Number.NaN;
  }

  const match = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return Number.NaN;
  }

  let hours = Number(match[1]) % 12;
  const minutes = Number(match[2]);

  if (match[3].toUpperCase() === 'PM') {
    hours += 12;
  }

  return (hours * 60) + minutes;
}

// --- Display labels -------------------------------------------------

export function formatDateLabel(dateValue) {
  // The API returns due dates as full ISO timestamps ("2026-08-24T00:00:00.000Z").
  // Take the calendar date verbatim -- parsing the instant would shift the day
  // backwards for anyone west of UTC.
  if (typeof dateValue !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
    return 'Not specified';
  }

  const [year, month, day] = dateValue.slice(0, 10).split('-').map(Number);
  const parsedDate = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsedDate.getTime())
    || parsedDate.getFullYear() !== year
    || parsedDate.getMonth() !== month - 1
    || parsedDate.getDate() !== day
  ) {
    return 'Not specified';
  }

  return parsedDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function formatDateTimeLabel(dateValue) {
  const normalizedValue = typeof dateValue === 'string'
    ? dateValue.replace(' ', 'T')
    : dateValue;
  const parsedDate = new Date(normalizedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Not recorded';
  }

  return parsedDate.toLocaleString();
}

export function formatRelativeDeadline(dateValue) {
  const parsedDate = new Date(dateValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Expiry unavailable';
  }

  const diffMs = parsedDate.getTime() - Date.now();

  if (diffMs <= 0) {
    return 'Expired';
  }

  const totalMinutes = Math.ceil(diffMs / 60000);

  if (totalMinutes < 60) {
    return `Expires in ${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 24) {
    return minutes ? `Expires in ${hours}h ${minutes}m` : `Expires in ${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours ? `Expires in ${days}d ${remainingHours}h` : `Expires in ${days}d`;
}
