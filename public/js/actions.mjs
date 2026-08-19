/* Server actions on transactions and ratings. */

import { getJson, postJson } from './api.js';

const ACTION_MESSAGES = {
  approve: 'Request approved. The reservation is now waiting for pickup verification.',
  reject: 'Request rejected.',
  cancel: 'Reservation cancelled.',
  confirm_pickup: 'Pickup verified. The loan is now active.',
  schedule_return_meetup: 'Return meetup saved.',
  issue_return_code: 'Return code generated. Share it with the lender during handoff.',
  confirm_return: 'Return verified. The item is available again.'
};

export function getActionSuccessMessage(action) {
  return ACTION_MESSAGES[action] || '';
}

export async function submitNotificationAction(notificationId, action, payload = {}) {
  await postJson(`/api/notifications/${notificationId}`, { action, ...payload });
  return getActionSuccessMessage(action);
}

export async function submitRating(userId, rating) {
  await postJson('/api/ratings', { userId, rating });
}

function setRateFormState({ rateUser, ratingValue, rateSubmitButton, rateMessage }, { disabled, message = '' }) {
  rateUser.disabled = disabled;
  ratingValue.disabled = disabled;
  rateSubmitButton.disabled = disabled;
  rateMessage.textContent = message;
}

function addOption(select, value, textContent, extra = {}) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = textContent;
  Object.assign(option, extra);
  select.appendChild(option);
  return option;
}

function getRateableUserLabel(user) {
  const displayName = user.full_name || user.username || 'User';
  return user.current_rating ? `${displayName} - current ${user.current_rating}/5` : displayName;
}

export async function loadEligibleUsers(rateElements) {
  const { rateUser } = rateElements;

  rateUser.replaceChildren();
  setRateFormState(rateElements, { disabled: true });

  try {
    const users = await getJson('/api/ratings/eligible');

    if (!users.length) {
      addOption(rateUser, '', 'No eligible users available');
      setRateFormState(rateElements, {
        disabled: true,
        message: 'No eligible users available right now.'
      });
      return users;
    }

    addOption(rateUser, '', 'Choose a user', { selected: true, disabled: true });
    users.forEach((user) => addOption(rateUser, user.id, getRateableUserLabel(user)));
    setRateFormState(rateElements, { disabled: false });
    return users;
  } catch (error) {
    addOption(rateUser, '', 'Unable to load users');
    setRateFormState(rateElements, {
      disabled: true,
      message: error.message || 'Unable to load users to rate.'
    });
    return [];
  }
}
