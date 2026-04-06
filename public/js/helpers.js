import { postJson } from './api.js';
import {
  appendLabeledParagraph,
  appendPlainParagraph,
  createElement,
  createRatingRow,
  createStatusBadge
} from './rendering.mjs';

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

function parsePickupWindowMinutes(label) {
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

function getDateTimeMinutes(value) {
  if (!isValidDateTimeLocal(value)) {
    return Number.NaN;
  }

  const [hours, minutes] = value.slice(11, 16).split(':').map(Number);
  return (hours * 60) + minutes;
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

export function formatDateLabel(dateValue) {
  if (typeof dateValue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return 'Not specified';
  }

  const [year, month, day] = dateValue.split('-').map(Number);
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
    return minutes
      ? `Expires in ${hours}h ${minutes}m`
      : `Expires in ${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours
    ? `Expires in ${days}d ${remainingHours}h`
    : `Expires in ${days}d`;
}

export function isValidUpeiEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith('@upei.ca');
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
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
  if (!normalizePhoneNumber(phone)) {
    return 'Please enter a valid phone number.';
  }

  return '';
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
  const placeholderValues = new Set(['n/a', 'na', 'none', 'unknown', 'test', 'tbd']);

  if (!normalizedAddress) {
    return 'Address is required.';
  }

  if (placeholderValues.has(normalizedAddress.toLowerCase())) {
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

export async function logout() {
  await postJson('/api/logout', {});
  redirectTo('/login');
}

export function renderRatings(listElement, ratings) {
  listElement.replaceChildren();

  if (!ratings.length) {
    listElement.appendChild(createElement('li', { textContent: 'No ratings yet.' }));
    return;
  }

  ratings.forEach((rating) => {
    const label = rating.rater_full_name || rating.rater_username || 'User';
    listElement.appendChild(createRatingRow(label, rating.rating));
  });
}

function getStageKey(entry) {
  return entry.transaction_stage || entry.loan_state || entry.status || 'pending';
}

function getStageNote(entry) {
  switch (getStageKey(entry)) {
    case 'awaiting_pickup':
      return 'Pickup must be verified before this reservation becomes an active loan.';
    case 'awaiting_return_confirmation':
      return 'Return code issued. Waiting for the lender to confirm the handoff.';
    case 'overdue':
      return `Overdue by ${entry.overdue_days} day${entry.overdue_days === 1 ? '' : 's'}.`;
    case 'due_today':
      return 'This loan is due today.';
    case 'active':
      return 'This item is currently on loan.';
    case 'cancelled':
      return 'This reservation expired or was cancelled before pickup.';
    case 'returned':
      return 'This loan has been verified as returned.';
    case 'rejected':
      return 'This request was declined.';
    default:
      return '';
  }
}

function createButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function createCodeForm(actionLabel, action, entry, onAction) {
  const form = document.createElement('form');
  form.className = 'verification-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.maxLength = 6;
  input.placeholder = '6-digit code';
  input.required = true;

  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'primary';
  button.textContent = actionLabel;

  form.appendChild(input);
  form.appendChild(button);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onAction(entry.id, action, { code: input.value.trim() }, 'notifications');
  });

  return form;
}

function createDateTimeForm(
  fieldLabel,
  actionLabel,
  action,
  entry,
  onAction,
  { payloadKey, value = '', context = 'notifications', buttonClass = 'primary' }
) {
  const form = document.createElement('form');
  form.className = 'schedule-form';

  const label = document.createElement('span');
  label.className = 'subtitle';
  label.textContent = fieldLabel;

  const input = document.createElement('input');
  input.type = 'datetime-local';
  input.required = true;
  input.min = getCurrentDateTimeLocalValue();
  input.value = formatDateTimeInputValue(value);
  input.setAttribute('aria-label', fieldLabel);

  const button = document.createElement('button');
  button.type = 'submit';
  button.className = buttonClass;
  button.textContent = actionLabel;

  form.appendChild(label);
  form.appendChild(input);
  form.appendChild(button);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onAction(entry.id, action, { [payloadKey]: input.value.trim() }, context);
  });

  return form;
}

function getBorrowerLabel(entry) {
  return entry.borrower_full_name
    || entry.borrower_username
    || 'Borrower';
}

function getLenderLabel(entry) {
  return entry.lender_full_name
    || entry.lender_username
    || 'Lender';
}

function appendSharedTransactionDetails(container, entry) {
  const note = getStageNote(entry);
  const pickupTime = entry.pickup_start_time && entry.pickup_end_time
    ? `${entry.pickup_start_time} - ${entry.pickup_end_time}`
    : 'Time unavailable';

  appendLabeledParagraph(
    container,
    'Pickup',
    `${entry.pickup_location || 'Location unavailable'} (${pickupTime})`
  );

  if (entry.pickup_meetup_at) {
    appendLabeledParagraph(container, 'Pickup meetup', formatDateTimeLabel(entry.pickup_meetup_at));
  }

  appendLabeledParagraph(container, 'Due date', formatDateLabel(entry.due_date));

  if (entry.return_meetup_at) {
    appendLabeledParagraph(container, 'Return meetup', formatDateTimeLabel(entry.return_meetup_at));
  }

  if (note) {
    appendPlainParagraph(container, note, 'subtitle');
  }

  if (Number(entry.late_fee) > 0) {
    appendLabeledParagraph(container, 'Late fee due', formatCurrency(entry.late_fee));
  }

  if (entry.approved_at) {
    appendLabeledParagraph(container, 'Approved', formatDateTimeLabel(entry.approved_at));
  }

  if (entry.approval_expires_at && getStageKey(entry) === 'awaiting_pickup') {
    appendLabeledParagraph(
      container,
      'Reservation holds until',
      `${formatDateTimeLabel(entry.approval_expires_at)} (${formatRelativeDeadline(entry.approval_expires_at)})`
    );
  }

  if (entry.picked_up_at) {
    appendLabeledParagraph(container, 'Picked up', formatDateTimeLabel(entry.picked_up_at));
  }

  if (entry.return_code_expires_at && getStageKey(entry) === 'awaiting_return_confirmation') {
    appendLabeledParagraph(container, 'Return code', formatRelativeDeadline(entry.return_code_expires_at));
  }

  if (entry.returned_at) {
    appendLabeledParagraph(container, 'Returned', formatDateTimeLabel(entry.returned_at));
  }
}

export function createProfileLinkButton(userId, interactionId, label) {
  const link = document.createElement('a');
  link.className = 'ghost profile-link-button';
  link.href = getUserProfilePath(userId, interactionId);
  link.textContent = label;
  return link;
}

export function appendStatusDetails(container, entry) {
  const note = getStageNote(entry);

  if (note) {
    appendPlainParagraph(container, note, 'subtitle');
  }

  if (entry.pickup_meetup_at) {
    appendLabeledParagraph(container, 'Pickup meetup', formatDateTimeLabel(entry.pickup_meetup_at));
  }

  if (entry.return_meetup_at) {
    appendLabeledParagraph(container, 'Return meetup', formatDateTimeLabel(entry.return_meetup_at));
  }

  if (entry.approved_at) {
    appendLabeledParagraph(container, 'Approved', formatDateTimeLabel(entry.approved_at));
  }

  if (entry.approval_expires_at && getStageKey(entry) === 'awaiting_pickup') {
    appendLabeledParagraph(container, 'Reservation holds until', formatDateTimeLabel(entry.approval_expires_at));
  }

  if (entry.picked_up_at) {
    appendLabeledParagraph(container, 'Picked up', formatDateTimeLabel(entry.picked_up_at));
  }

  if (entry.return_code_expires_at && getStageKey(entry) === 'awaiting_return_confirmation') {
    appendLabeledParagraph(container, 'Return code', formatRelativeDeadline(entry.return_code_expires_at));
  }

  if (entry.returned_at) {
    appendLabeledParagraph(container, 'Returned', formatDateTimeLabel(entry.returned_at));
  }

  if (Number(entry.late_fee) > 0) {
    appendLabeledParagraph(container, 'Late fee due', formatCurrency(entry.late_fee));
  }
}

export function createNotificationCard(notification, onAction) {
  const statusKey = getStageKey(notification);
  const statusLabel = notification.display_status || statusKey;
  const card = createElement('div', { className: 'notification-card' });
  const body = createElement('div');
  const top = createElement('div', { className: 'history-top' });

  top.appendChild(createElement('strong', { textContent: notification.product_name || 'Item' }));
  top.appendChild(createStatusBadge(statusKey, statusLabel));
  body.appendChild(top);
  appendLabeledParagraph(body, 'Borrower', getBorrowerLabel(notification));
  appendPlainParagraph(body, `Pickup option ${notification.pickup_option} selected for this request.`, 'subtitle');
  appendLabeledParagraph(body, 'Daily price', formatPrice(notification.daily_price));
  appendSharedTransactionDetails(body, notification);
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'notification-actions';

  if (Number.isInteger(Number(notification.borrower_id)) && Number(notification.borrower_id) > 0) {
    actions.appendChild(
      createProfileLinkButton(notification.borrower_id, notification.id, 'View borrower profile')
    );
  }

  const allowedActions = notification.allowed_actions || [];

  if (allowedActions.includes('approve')) {
    actions.appendChild(
      createDateTimeForm(
        'Pickup meetup',
        'Approve request',
        'approve',
        notification,
        onAction,
        {
          payloadKey: 'pickupMeetupAt',
          value: notification.pickup_meetup_at,
          context: 'notifications'
        }
      )
    );
  }

  if (allowedActions.includes('reject')) {
    actions.appendChild(
      createButton('Reject', 'button-danger', () => onAction(notification.id, 'reject', {}, 'notifications'))
    );
  }

  if (allowedActions.includes('cancel')) {
    actions.appendChild(
      createButton('Cancel reservation', 'ghost', () => onAction(notification.id, 'cancel', {}, 'notifications'))
    );
  }

  if (allowedActions.includes('schedule_return_meetup')) {
    actions.appendChild(
      createDateTimeForm(
        'Return meetup',
        notification.return_meetup_at ? 'Update return meetup' : 'Save return meetup',
        'schedule_return_meetup',
        notification,
        onAction,
        {
          payloadKey: 'returnMeetupAt',
          value: notification.return_meetup_at,
          context: 'notifications',
          buttonClass: 'ghost'
        }
      )
    );
  }

  if (allowedActions.includes('confirm_pickup')) {
    actions.appendChild(createCodeForm('Confirm pickup', 'confirm_pickup', notification, onAction));
  }

  if (allowedActions.includes('confirm_return')) {
    actions.appendChild(createCodeForm('Confirm return', 'confirm_return', notification, onAction));
  }

  if (actions.childElementCount) {
    card.appendChild(actions);
  }

  return card;
}

export function createBorrowerTransactionCard(transaction, onAction) {
  const statusKey = getStageKey(transaction);
  const statusLabel = transaction.display_status || statusKey;
  const card = createElement('div', { className: 'notification-card' });
  const body = createElement('div');
  const top = createElement('div', { className: 'history-top' });

  top.appendChild(createElement('strong', { textContent: transaction.product_name || 'Item' }));
  top.appendChild(createStatusBadge(statusKey, statusLabel));
  body.appendChild(top);
  appendLabeledParagraph(body, 'Lender', getLenderLabel(transaction));
  appendLabeledParagraph(body, 'Daily price', formatPrice(transaction.daily_price));
  appendSharedTransactionDetails(body, transaction);
  card.appendChild(body);

  if (transaction.pickup_code) {
    const pickupPanel = createElement('div', { className: 'verification-code-panel' });
    pickupPanel.appendChild(createElement('span', {
      className: 'section-kicker',
      textContent: 'Pickup Code'
    }));
    pickupPanel.appendChild(createElement('strong', { textContent: transaction.pickup_code }));
    pickupPanel.appendChild(createElement('p', {
      className: 'subtitle',
      textContent: formatRelativeDeadline(transaction.pickup_code_expires_at)
    }));
    body.appendChild(pickupPanel);
  }

  if (transaction.return_code) {
    const returnPanel = createElement('div', { className: 'verification-code-panel' });
    returnPanel.appendChild(createElement('span', {
      className: 'section-kicker',
      textContent: 'Return Code'
    }));
    returnPanel.appendChild(createElement('strong', { textContent: transaction.return_code }));
    returnPanel.appendChild(createElement('p', {
      className: 'subtitle',
      textContent: formatRelativeDeadline(transaction.return_code_expires_at)
    }));
    body.appendChild(returnPanel);
  }

  const actions = document.createElement('div');
  actions.className = 'notification-actions';

  if (Number.isInteger(Number(transaction.lender_id)) && Number(transaction.lender_id) > 0) {
    actions.appendChild(
      createProfileLinkButton(transaction.lender_id, transaction.id, 'View lender profile')
    );
  }

  if ((transaction.allowed_actions || []).includes('issue_return_code')) {
    const buttonLabel = transaction.return_code
      ? 'Refresh return code'
      : 'Generate return code';

    if (transaction.return_meetup_at) {
      actions.appendChild(
        createButton(
          buttonLabel,
          'primary',
          () => onAction(transaction.id, 'issue_return_code', {}, 'transactions')
        )
      );
    }
  }

  if ((transaction.allowed_actions || []).includes('schedule_return_meetup')) {
    actions.appendChild(
      createDateTimeForm(
        'Return meetup',
        transaction.return_meetup_at ? 'Update return meetup' : 'Save return meetup',
        'schedule_return_meetup',
        transaction,
        onAction,
        {
          payloadKey: 'returnMeetupAt',
          value: transaction.return_meetup_at,
          context: 'transactions'
        }
      )
    );
  }

  if (actions.childElementCount) {
    card.appendChild(actions);
  }

  return card;
}

export function createLoanAlertCard(alert) {
  const statusKey = getStageKey(alert);
  const statusLabel = alert.display_status || statusKey;
  const note = getStageNote(alert);
  const card = createElement('div', { className: 'notification-card' });
  const body = createElement('div');
  const top = createElement('div', { className: 'history-top' });

  top.appendChild(createElement('strong', { textContent: alert.product_name || 'Item' }));
  top.appendChild(createStatusBadge(statusKey, statusLabel));
  body.appendChild(top);
  appendLabeledParagraph(body, alert.counterpart_role, alert.counterpart_name);

  if (alert.pickup_meetup_at) {
    appendLabeledParagraph(body, 'Pickup meetup', formatDateTimeLabel(alert.pickup_meetup_at));
  }

  if (alert.due_date) {
    appendLabeledParagraph(body, 'Due date', formatDateLabel(alert.due_date));
  }

  if (alert.return_meetup_at) {
    appendLabeledParagraph(body, 'Return meetup', formatDateTimeLabel(alert.return_meetup_at));
  }

  if (note) {
    appendPlainParagraph(body, note, 'subtitle');
  }

  if (alert.approval_expires_at && statusKey === 'awaiting_pickup') {
    appendLabeledParagraph(body, 'Reservation holds until', formatDateTimeLabel(alert.approval_expires_at));
  }

  if (alert.return_code_expires_at && statusKey === 'awaiting_return_confirmation') {
    appendLabeledParagraph(body, 'Return code', formatRelativeDeadline(alert.return_code_expires_at));
  }

  if (Number(alert.late_fee) > 0) {
    appendLabeledParagraph(body, 'Late fee due', formatCurrency(alert.late_fee));
  }

  card.appendChild(body);

  return card;
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}
