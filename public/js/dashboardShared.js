import { getJson, postJson } from './api.js';
import { formatPrice, redirectTo } from './helpers.js';
import {
  createEmptyState as createSafeEmptyState,
  createProductCard as createSafeProductCard
} from './rendering.mjs';

export const DEFAULT_PRODUCT_IMAGE = '/images/campus-placeholder.svg';

export function createEmptyState(title, message) {
  return createSafeEmptyState(title, message);
}

function matchesSearch(product, searchValue) {
  if (!searchValue) {
    return true;
  }

  return product.Product_Name.toLowerCase().includes(searchValue)
    || (product.Product_Description || '').toLowerCase().includes(searchValue)
    || (product.Product_Condition || '').toLowerCase().includes(searchValue);
}

export function getOwnedProducts(products, currentUserId) {
  if (!currentUserId) {
    return [];
  }

  return products.filter((product) => Number(product.Product_Lender_ID) === Number(currentUserId));
}

export function getCatalogProducts(products, currentUserId, searchValue = '') {
  const normalizedSearch = searchValue.trim().toLowerCase();

  return products.filter((product) => {
    const isOwnedByCurrentUser = currentUserId
      && Number(product.Product_Lender_ID) === Number(currentUserId);

    if (isOwnedByCurrentUser || product.Product_Borrower_ID) {
      return false;
    }

    return matchesSearch(product, normalizedSearch);
  });
}

export function createProductCard(product, { ownerView = false, onRemove = null } = {}) {
  const isAvailable = !product.Product_Borrower_ID;
  const currentTransactionStatus = product.Current_Transaction_Status || product.current_transaction_status || '';
  const statusLabel = ownerView
    ? (isAvailable ? 'Listed' : (currentTransactionStatus === 'approved' ? 'Reserved' : 'On Loan'))
    : 'Available';

  return createSafeProductCard(product, {
    ownerView,
    statusLabel,
    formatPrice,
    onRemove,
    onSelect: () => redirectTo(`/product/${product.Product_ID}`)
  });
}

export function renderCardGrid(gridElement, items, emptyTitle, emptyMessage, options = {}) {
  const nextContent = document.createDocumentFragment();

  if (!items.length) {
    nextContent.appendChild(createEmptyState(emptyTitle, emptyMessage));
    gridElement.replaceChildren(nextContent);
    return;
  }

  items.forEach((item) => {
    nextContent.appendChild(createProductCard(item, options));
  });

  gridElement.replaceChildren(nextContent);
}

export async function removeListing(product) {
  if (!product || !Number.isInteger(Number(product.Product_ID))) {
    throw new Error('Unable to remove this listing.');
  }

  const confirmed = window.confirm(
    `Remove "${product.Product_Name}" from your active listings? Pending requests will be rejected.`
  );

  if (!confirmed) {
    return false;
  }

  await postJson(`/api/products/${product.Product_ID}/remove`, {});
  return true;
}

export function getActionSuccessMessage(action) {
  switch (action) {
    case 'approve':
      return 'Request approved. The reservation is now waiting for pickup verification.';
    case 'reject':
      return 'Request rejected.';
    case 'cancel':
      return 'Reservation cancelled.';
    case 'confirm_pickup':
      return 'Pickup verified. The loan is now active.';
    case 'schedule_return_meetup':
      return 'Return meetup saved.';
    case 'issue_return_code':
      return 'Return code generated. Share it with the lender during handoff.';
    case 'confirm_return':
      return 'Return verified. The item is available again.';
    default:
      return '';
  }
}

export async function submitNotificationAction(notificationId, action, payload = {}) {
  await postJson(`/api/notifications/${notificationId}`, { action, ...payload });
  return getActionSuccessMessage(action);
}

export function setRateFormState(
  { rateUser, ratingValue, rateSubmitButton, rateMessage },
  { disabled, message = '' }
) {
  rateUser.disabled = disabled;
  ratingValue.disabled = disabled;
  rateSubmitButton.disabled = disabled;
  rateMessage.textContent = message;
}

function getRateableUserLabel(user) {
  const displayName = user.full_name || user.username || 'User';
  return user.current_rating
    ? `${displayName} - current ${user.current_rating}/5`
    : displayName;
}

export async function loadEligibleUsers(rateElements) {
  const { rateUser, ratingValue, rateSubmitButton, rateMessage } = rateElements;

  rateUser.replaceChildren();
  setRateFormState(
    { rateUser, ratingValue, rateSubmitButton, rateMessage },
    { disabled: true }
  );

  try {
    const users = await getJson('/api/ratings/eligible');

    if (!users.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No eligible users available';
      rateUser.appendChild(option);
      setRateFormState(
        { rateUser, ratingValue, rateSubmitButton, rateMessage },
        { disabled: true, message: 'No eligible users available right now.' }
      );
      return users;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a user';
    placeholder.selected = true;
    placeholder.disabled = true;
    rateUser.appendChild(placeholder);

    users.forEach((user) => {
      const option = document.createElement('option');
      option.value = user.id;
      option.textContent = getRateableUserLabel(user);
      rateUser.appendChild(option);
    });

    setRateFormState(
      { rateUser, ratingValue, rateSubmitButton, rateMessage },
      { disabled: false }
    );
    return users;
  } catch (error) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Unable to load users';
    rateUser.appendChild(option);
    setRateFormState(
      { rateUser, ratingValue, rateSubmitButton, rateMessage },
      { disabled: true, message: error.message || 'Unable to load users to rate.' }
    );
    return [];
  }
}

export async function submitRating(userId, rating) {
  await postJson('/api/ratings', { userId, rating });
}
