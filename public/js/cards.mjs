/* Transaction card rendering. One builder serves the lender queue, the
   borrower workspace, and read-only loan alerts. */

import {
  formatCurrency,
  formatDateLabel,
  formatDateTimeInputValue,
  formatDateTimeLabel,
  formatPrice,
  formatRelativeDeadline,
  getCurrentDateTimeLocalValue,
  getUserProfilePath
} from './format.mjs';
import {
  appendLabeledParagraph,
  appendPlainParagraph,
  createElement,
  createRatingRow,
  createStatusBadge
} from './rendering.mjs';

const STAGE_NOTES = {
  awaiting_pickup: 'Pickup must be verified before this reservation becomes an active loan.',
  awaiting_return_confirmation: 'Return code issued. Waiting for the lender to confirm the handoff.',
  due_today: 'This loan is due today.',
  active: 'This item is currently on loan.',
  cancelled: 'This reservation expired or was cancelled before pickup.',
  returned: 'This loan has been verified as returned.',
  rejected: 'This request was declined.'
};

export function getStageKey(entry) {
  return entry.transaction_stage || entry.loan_state || entry.status || 'pending';
}

export function getStageNote(entry) {
  const stage = getStageKey(entry);

  if (stage === 'overdue') {
    return `Overdue by ${entry.overdue_days} day${entry.overdue_days === 1 ? '' : 's'}.`;
  }

  return STAGE_NOTES[stage] || '';
}

// --- Small builders -------------------------------------------------

function createButton(label, className, onClick) {
  const button = createElement('button', { className, textContent: label });
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

export function createProfileLinkButton(userId, interactionId, label) {
  return createElement('a', {
    className: 'ghost profile-link-button',
    textContent: label,
    attributes: { href: getUserProfilePath(userId, interactionId) }
  });
}

function createCodeForm(actionLabel, action, entry, onAction, context) {
  const form = createElement('form', { className: 'verification-form' });
  const field = createElement('div', { className: 'field' });
  const input = createElement('input', {
    attributes: {
      type: 'text',
      inputmode: 'numeric',
      maxlength: '6',
      placeholder: '6-digit code',
      'aria-label': `${actionLabel} code`
    }
  });
  input.required = true;

  const button = createElement('button', { className: 'primary', textContent: actionLabel });
  button.type = 'submit';

  field.appendChild(input);
  form.appendChild(field);
  form.appendChild(button);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onAction(entry.id, action, { code: input.value.trim() }, context);
  });

  return form;
}

function createDateTimeForm(entry, onAction, {
  fieldLabel,
  actionLabel,
  action,
  payloadKey,
  value = '',
  context,
  buttonClass = 'primary'
}) {
  const form = createElement('form', { className: 'schedule-form' });
  const field = createElement('div', { className: 'field' });
  field.appendChild(createElement('label', { textContent: fieldLabel }));

  const input = createElement('input', {
    attributes: { type: 'datetime-local', 'aria-label': fieldLabel }
  });
  input.required = true;
  input.min = getCurrentDateTimeLocalValue();
  input.value = formatDateTimeInputValue(value);

  const button = createElement('button', { className: buttonClass, textContent: actionLabel });
  button.type = 'submit';

  field.appendChild(input);
  form.appendChild(field);
  form.appendChild(button);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onAction(entry.id, action, { [payloadKey]: input.value.trim() }, context);
  });

  return form;
}

function createCodePanel(label, code, expiresAt) {
  const panel = createElement('div', { className: 'verification-code-panel' });
  panel.appendChild(createElement('span', { className: 'section-kicker', textContent: label }));
  panel.appendChild(createElement('strong', { textContent: code }));
  panel.appendChild(createElement('p', {
    className: 'subtitle',
    textContent: formatRelativeDeadline(expiresAt)
  }));
  return panel;
}

// --- Detail blocks --------------------------------------------------

/** Every timeline row a card can show, keyed for per-view selection. */
function detailRows(entry, { relativeHold = false } = {}) {
  const stage = getStageKey(entry);
  const pickupTime = entry.pickup_start_time && entry.pickup_end_time
    ? `${entry.pickup_start_time} - ${entry.pickup_end_time}`
    : 'Time unavailable';
  const hold = entry.approval_expires_at && stage === 'awaiting_pickup'
    ? (relativeHold
      ? `${formatDateTimeLabel(entry.approval_expires_at)} (${formatRelativeDeadline(entry.approval_expires_at)})`
      : formatDateTimeLabel(entry.approval_expires_at))
    : null;

  return {
    pickup: `${entry.pickup_location || 'Location unavailable'} (${pickupTime})`,
    pickupMeetup: entry.pickup_meetup_at && formatDateTimeLabel(entry.pickup_meetup_at),
    dueDate: entry.due_date && formatDateLabel(entry.due_date),
    returnMeetup: entry.return_meetup_at && formatDateTimeLabel(entry.return_meetup_at),
    lateFee: Number(entry.late_fee) > 0 ? formatCurrency(entry.late_fee) : null,
    approved: entry.approved_at && formatDateTimeLabel(entry.approved_at),
    hold,
    pickedUp: entry.picked_up_at && formatDateTimeLabel(entry.picked_up_at),
    returnCode: entry.return_code_expires_at && stage === 'awaiting_return_confirmation'
      ? formatRelativeDeadline(entry.return_code_expires_at)
      : null,
    returned: entry.returned_at && formatDateTimeLabel(entry.returned_at)
  };
}

const LABELS = {
  pickup: 'Pickup',
  pickupMeetup: 'Pickup meetup',
  dueDate: 'Due date',
  returnMeetup: 'Return meetup',
  lateFee: 'Late fee due',
  approved: 'Approved',
  hold: 'Reservation holds until',
  pickedUp: 'Picked up',
  returnCode: 'Return code',
  returned: 'Returned'
};

function appendRows(container, rows, order) {
  order.forEach((key) => {
    if (rows[key]) {
      appendLabeledParagraph(container, LABELS[key], rows[key]);
    }
  });
}

/** Timeline shared by the lender and borrower views. */
function appendSharedDetails(container, entry) {
  const rows = detailRows(entry, { relativeHold: true });
  const note = getStageNote(entry);

  appendRows(container, rows, ['pickup', 'pickupMeetup']);
  appendLabeledParagraph(container, LABELS.dueDate, rows.dueDate || 'Not specified');
  appendRows(container, rows, ['returnMeetup']);

  if (note) {
    appendPlainParagraph(container, note, 'subtitle');
  }

  appendRows(container, rows, ['lateFee', 'approved', 'hold', 'pickedUp', 'returnCode', 'returned']);
}

/** Condensed timeline used by the profile history list. */
export function appendStatusDetails(container, entry) {
  const note = getStageNote(entry);

  if (note) {
    appendPlainParagraph(container, note, 'subtitle');
  }

  appendRows(container, detailRows(entry), [
    'pickupMeetup', 'returnMeetup', 'approved', 'hold', 'pickedUp', 'returnCode', 'returned', 'lateFee'
  ]);
}

/** Read-only loan alert timeline. */
function appendAlertDetails(container, entry) {
  const rows = detailRows(entry);
  const note = getStageNote(entry);

  appendLabeledParagraph(container, entry.counterpart_role, entry.counterpart_name);
  appendRows(container, rows, ['pickupMeetup', 'dueDate', 'returnMeetup']);

  if (note) {
    appendPlainParagraph(container, note, 'subtitle');
  }

  appendRows(container, rows, ['hold', 'returnCode', 'lateFee']);
}

// --- Role definitions -----------------------------------------------

const ROLES = {
  lender: {
    context: 'notifications',
    counterpartId: (entry) => entry.borrower_id,
    counterpartLabel: 'View borrower profile',
    showCodePanels: false,
    body(container, entry) {
      appendLabeledParagraph(
        container,
        'Borrower',
        entry.borrower_full_name || entry.borrower_username || 'Borrower'
      );
      appendPlainParagraph(
        container,
        `Pickup option ${entry.pickup_option} selected for this request.`,
        'subtitle'
      );
      appendLabeledParagraph(container, 'Daily price', formatPrice(entry.daily_price));
      appendSharedDetails(container, entry);
    },
    actions(entry, onAction) {
      const allowed = entry.allowed_actions || [];
      const built = [];

      if (allowed.includes('approve')) {
        built.push(createDateTimeForm(entry, onAction, {
          fieldLabel: 'Pickup meetup',
          actionLabel: 'Approve request',
          action: 'approve',
          payloadKey: 'pickupMeetupAt',
          value: entry.pickup_meetup_at,
          context: 'notifications'
        }));
      }

      if (allowed.includes('reject')) {
        built.push(createButton('Reject', 'button-danger', () => onAction(entry.id, 'reject', {}, 'notifications')));
      }

      if (allowed.includes('cancel')) {
        built.push(createButton('Cancel reservation', 'ghost', () => onAction(entry.id, 'cancel', {}, 'notifications')));
      }

      if (allowed.includes('schedule_return_meetup')) {
        built.push(createDateTimeForm(entry, onAction, {
          fieldLabel: 'Return meetup',
          actionLabel: entry.return_meetup_at ? 'Update return meetup' : 'Save return meetup',
          action: 'schedule_return_meetup',
          payloadKey: 'returnMeetupAt',
          value: entry.return_meetup_at,
          context: 'notifications',
          buttonClass: 'ghost'
        }));
      }

      if (allowed.includes('confirm_pickup')) {
        built.push(createCodeForm('Confirm pickup', 'confirm_pickup', entry, onAction, 'notifications'));
      }

      if (allowed.includes('confirm_return')) {
        built.push(createCodeForm('Confirm return', 'confirm_return', entry, onAction, 'notifications'));
      }

      return built;
    }
  },

  borrower: {
    context: 'transactions',
    counterpartId: (entry) => entry.lender_id,
    counterpartLabel: 'View lender profile',
    showCodePanels: true,
    body(container, entry) {
      appendLabeledParagraph(
        container,
        'Lender',
        entry.lender_full_name || entry.lender_username || 'Lender'
      );
      appendLabeledParagraph(container, 'Daily price', formatPrice(entry.daily_price));
      appendSharedDetails(container, entry);
    },
    actions(entry, onAction) {
      const allowed = entry.allowed_actions || [];
      const built = [];

      if (allowed.includes('issue_return_code') && entry.return_meetup_at) {
        built.push(createButton(
          entry.return_code ? 'Refresh return code' : 'Generate return code',
          'primary',
          () => onAction(entry.id, 'issue_return_code', {}, 'transactions')
        ));
      }

      if (allowed.includes('schedule_return_meetup')) {
        built.push(createDateTimeForm(entry, onAction, {
          fieldLabel: 'Return meetup',
          actionLabel: entry.return_meetup_at ? 'Update return meetup' : 'Save return meetup',
          action: 'schedule_return_meetup',
          payloadKey: 'returnMeetupAt',
          value: entry.return_meetup_at,
          context: 'transactions'
        }));
      }

      return built;
    }
  },

  alert: {
    counterpartId: () => null,
    showCodePanels: false,
    body: appendAlertDetails,
    actions: () => []
  }
};

/**
 * Builds one transaction card.
 * @param {object} entry  notification, transaction, or loan alert
 * @param {{ role: 'lender'|'borrower'|'alert', onAction?: Function }} options
 */
export function createTransactionCard(entry, { role, onAction } = {}) {
  const config = ROLES[role];

  if (!config) {
    throw new Error(`Unknown transaction card role: ${role}`);
  }

  const stageKey = getStageKey(entry);
  const card = createElement('div', { className: 'notification-card' });
  const body = createElement('div');
  const top = createElement('div', { className: 'history-top' });

  top.appendChild(createElement('strong', { textContent: entry.product_name || 'Item' }));
  top.appendChild(createStatusBadge(stageKey, entry.display_status || stageKey));
  body.appendChild(top);

  config.body(body, entry);

  if (config.showCodePanels) {
    if (entry.pickup_code) {
      body.appendChild(createCodePanel('Pickup Code', entry.pickup_code, entry.pickup_code_expires_at));
    }

    if (entry.return_code) {
      body.appendChild(createCodePanel('Return Code', entry.return_code, entry.return_code_expires_at));
    }
  }

  card.appendChild(body);

  const counterpartId = Number(config.counterpartId(entry));
  const actions = createElement('div', { className: 'notification-actions' });

  if (Number.isInteger(counterpartId) && counterpartId > 0) {
    actions.appendChild(createProfileLinkButton(counterpartId, entry.id, config.counterpartLabel));
  }

  config.actions(entry, onAction).forEach((node) => actions.appendChild(node));

  if (actions.childElementCount) {
    card.appendChild(actions);
  }

  return card;
}

export function renderRatings(listElement, ratings) {
  listElement.replaceChildren();

  if (!ratings.length) {
    listElement.appendChild(createElement('li', { textContent: 'No ratings yet.' }));
    return;
  }

  ratings.forEach((rating) => {
    listElement.appendChild(createRatingRow(
      rating.rater_full_name || rating.rater_username || 'User',
      rating.rating
    ));
  });
}
