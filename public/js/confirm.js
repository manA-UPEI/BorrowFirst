import { getJson, postJson } from './api.js';
import {
  formatDateLabel,
  formatDateTimeInputValue,
  getCurrentDateTimeLocalValue,
  getPickupMeetupValidationMessage,
  formatPrice,
  getQueryParam,
  getRouteId,
  getTodayDateValue,
  logout,
  redirectTo
} from './helpers.js';
import { renderSummary } from './rendering.mjs';

const productId = getRouteId();
const slot = getQueryParam('slot');
const dueDate = getQueryParam('dueDate');
const initialPickupMeetupAt = getQueryParam('pickupMeetupAt');
const summary = document.getElementById('summary');
const pickupMeetupInput = document.getElementById('pickupMeetupAt');
const pickupWindowHint = document.getElementById('pickupWindowHint');
const confirmMessage = document.getElementById('confirmMessage');
const okButton = document.getElementById('okButton');
const logoutButton = document.getElementById('logoutButton');

let canSendRequest = false;
let selectedPickupOption = null;

okButton.disabled = true;
pickupMeetupInput.min = getCurrentDateTimeLocalValue();
pickupMeetupInput.value = formatDateTimeInputValue(initialPickupMeetupAt) || getCurrentDateTimeLocalValue();

function isValidDueDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsedDate = new Date(year, month - 1, day);

  return parsedDate.getFullYear() === year
    && parsedDate.getMonth() === month - 1
    && parsedDate.getDate() === day;
}

function setConfirmState({ canSubmit, buttonText, message = '' }) {
  canSendRequest = canSubmit;
  okButton.disabled = !canSubmit;
  okButton.textContent = buttonText;
  confirmMessage.textContent = message;
}

async function loadSummary() {
  try {
    const [product, options] = await Promise.all([
      getJson(`/api/products/${productId}`),
      getJson(`/api/pickup-options/${productId}`)
    ]);

    selectedPickupOption = options.find((option) => String(option.option_index) === String(slot));

    renderSummary(summary, [
      { label: 'Product', value: product.Product_Name },
      {
        label: 'Pickup',
        value: selectedPickupOption ? selectedPickupOption.location : 'Unknown option'
      },
      {
        label: 'Time Window',
        value: selectedPickupOption
          ? `${selectedPickupOption.start_time} - ${selectedPickupOption.end_time}`
          : 'N/A'
      },
      { label: 'Due Date', value: formatDateLabel(dueDate) },
      { label: 'Daily Rate', value: formatPrice(product.Product_Lending_Charge) }
    ]);
    pickupWindowHint.textContent = selectedPickupOption
      ? `Meet at ${selectedPickupOption.location} between ${selectedPickupOption.start_time} and ${selectedPickupOption.end_time}.`
      : 'Selected pickup option is unavailable.';

    if (!selectedPickupOption) {
      setConfirmState({
        canSubmit: false,
        buttonText: 'Unavailable',
        message: 'Invalid pickup option selected.'
      });
      return;
    }

    if (!product.listing_is_active) {
      setConfirmState({
        canSubmit: false,
        buttonText: product.viewer_is_lender ? 'Removed' : 'Unavailable',
        message: product.viewer_is_lender
          ? 'This listing has been removed from your active shelf.'
          : 'This listing is no longer available.'
      });
      return;
    }

    if (product.viewer_is_lender) {
      setConfirmState({
        canSubmit: false,
        buttonText: 'Your listing',
        message: 'You cannot send a request for your own listing.'
      });
      return;
    }

    if (product.Product_Borrower_ID) {
      const isAwaitingPickup = product.current_transaction_status === 'approved';
      setConfirmState({
        canSubmit: false,
        buttonText: product.viewer_is_borrower && isAwaitingPickup
          ? 'Reserved for you'
          : 'Unavailable',
        message: product.viewer_is_borrower
          ? (isAwaitingPickup
            ? 'This item is already reserved for you. Open My Transactions to get the pickup code.'
            : 'You already borrowed this item.')
          : (isAwaitingPickup
            ? 'This item is currently reserved for pickup verification.'
            : 'This item is currently unavailable.')
      });
      return;
    }

    setConfirmState({
      canSubmit: true,
      buttonText: 'Send Request',
      message: ''
    });
  } catch (error) {
    summary.textContent = 'Unable to load confirmation details.';
    setConfirmState({
      canSubmit: false,
      buttonText: 'Unavailable',
      message: 'Unable to load request details.'
    });
  }
}

okButton.addEventListener('click', async () => {
  confirmMessage.textContent = '';

  if (!canSendRequest) {
    confirmMessage.textContent = 'You cannot send a request for this item.';
    return;
  }

  const pickupOption = Number(slot);

  if (!Number.isInteger(pickupOption) || pickupOption <= 0) {
    confirmMessage.textContent = 'Invalid pickup option selected.';
    return;
  }

  if (!isValidDueDate(dueDate)) {
    confirmMessage.textContent = 'Invalid due date selected.';
    return;
  }

  if (dueDate < getTodayDateValue()) {
    confirmMessage.textContent = 'Due date cannot be in the past.';
    return;
  }

  const pickupMeetupAt = pickupMeetupInput.value;
  const pickupMeetupMessage = getPickupMeetupValidationMessage(
    pickupMeetupAt,
    selectedPickupOption?.start_time,
    selectedPickupOption?.end_time,
    dueDate
  );

  if (pickupMeetupMessage) {
    confirmMessage.textContent = pickupMeetupMessage;
    return;
  }

  try {
    await postJson('/api/notifications', {
      productId: Number(productId),
      pickupOption,
      pickupMeetupAt,
      dueDate
    });

    redirectTo('/home');
  } catch (error) {
    confirmMessage.textContent = error.message || 'Unable to send request.';
  }
});

logoutButton.addEventListener('click', logout);

loadSummary();
