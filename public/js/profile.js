import { getJson, postJson } from './api.js';
import {
  appendStatusDetails,
  createProfileLinkButton,
  formatDateLabel,
  formatDateTimeLabel,
  formatPrice,
  getAddressValidationMessage,
  getCountryValidationMessage,
  getPhoneValidationMessage,
  getQueryParam,
  getUserProfilePath,
  isValidUpeiEmail,
  logout,
  renderRatings
} from './helpers.js';
import {
  appendLabeledParagraph,
  appendPlainParagraph,
  createElement,
  createStatusBadge
} from './rendering.mjs';

const profilePageTitle = document.getElementById('profilePageTitle');
const profilePageSubtitle = document.getElementById('profilePageSubtitle');
const ownProfileLink = document.getElementById('ownProfileLink');
const profileEmail = document.getElementById('profileEmail');
const profileUsername = document.getElementById('profileUsername');
const profileFullName = document.getElementById('profileFullName');
const profileMeta = document.getElementById('profileMeta');
const profileRating = document.getElementById('profileRating');
const profileCount = document.getElementById('profileCount');
const profileRatingsList = document.getElementById('profileRatingsList');
const profileForm = document.getElementById('profileForm');
const profileDisplayNameInput = document.getElementById('profileDisplayNameInput');
const profileFullNameInput = document.getElementById('profileFullNameInput');
const profileEmailInput = document.getElementById('profileEmailInput');
const profilePhoneInput = document.getElementById('profilePhoneInput');
const profileCountryInput = document.getElementById('profileCountryInput');
const profileAddressInput = document.getElementById('profileAddressInput');
const profileMessage = document.getElementById('profileMessage');
const profileEditSection = document.getElementById('profileEditSection');
const profileHistorySection = document.getElementById('profileHistorySection');
const historyList = document.getElementById('historyList');
const logoutButton = document.getElementById('logoutButton');
const viewedUserParam = getQueryParam('user');
const viewedUserId = Number(viewedUserParam);
const viewedInteractionParam = getQueryParam('interaction');
const viewedInteractionId = Number(viewedInteractionParam);

function getDisplayName(user) {
  return user.full_name || user.username || 'User';
}

function renderProfileMeta(user, isSelf) {
  const parts = [user.phone, user.country, user.address].filter(Boolean);
  profileMeta.replaceChildren();

  if (!parts.length) {
    const item = document.createElement('p');
    item.className = 'subtitle';
    item.textContent = isSelf
      ? 'No contact details added yet.'
      : 'Contact details are private.';
    profileMeta.appendChild(item);
    return;
  }

  parts.forEach((value) => {
    const item = document.createElement('span');
    item.className = 'meta-pill';
    item.textContent = value;
    profileMeta.appendChild(item);
  });
}

function populateProfileForm(user) {
  profileDisplayNameInput.value = user.username || '';
  profileFullNameInput.value = user.full_name || user.username || '';
  profileEmailInput.value = user.email || '';
  profilePhoneInput.value = user.phone || '';
  profileCountryInput.value = user.country || '';
  profileAddressInput.value = user.address || '';
}

function renderProfile(user, ratingData, { isSelf }) {
  profileEmail.textContent = user.email || (isSelf ? 'No email available.' : 'Contact details are private.');
  profileUsername.textContent = getDisplayName(user);
  profileFullName.textContent = user.username ? `Display name: ${user.username}` : 'Display name not set';
  renderProfileMeta(user, isSelf);
  profileRating.textContent = ratingData.average ? ratingData.average.toFixed(1) : '0.0';
  profileCount.textContent = `${ratingData.count} rating${ratingData.count === 1 ? '' : 's'}`;
  renderRatings(profileRatingsList, ratingData.ratings || []);
}

function setPageMode({ isSelf, user = null }) {
  profileEditSection.classList.toggle('hidden', !isSelf);
  profileHistorySection.classList.toggle('hidden', !isSelf);
  ownProfileLink.classList.toggle('hidden', isSelf);

  if (isSelf) {
    profilePageTitle.textContent = 'Your Profile';
    profilePageSubtitle.textContent = 'See your account details and latest ratings.';
    document.title = 'BorrowFirst | Profile';
    return;
  }

  profilePageTitle.textContent = 'Member Profile';
  profilePageSubtitle.textContent = 'See the account details and recent ratings for your lending or borrowing counterpart.';
  document.title = `BorrowFirst | ${user ? getDisplayName(user) : 'Profile'}`;
}

function setProfileUnavailable(message, { isSelf }) {
  setPageMode({ isSelf });
  profileEmail.textContent = message;
  profileUsername.textContent = 'User';
  profileFullName.textContent = 'Full name not set';
  profileMeta.replaceChildren();
  profileRating.textContent = '--';
  profileCount.textContent = '0 ratings';
  profileRatingsList.replaceChildren(createElement('li', { textContent: 'No ratings yet.' }));

  if (isSelf) {
    historyList.replaceChildren(createElement('li', {
      className: 'history-card',
      textContent: 'Unable to load history.'
    }));
  } else {
    historyList.replaceChildren();
  }
}

function renderHistory(history) {
  historyList.replaceChildren();

  if (!history.length) {
    const item = document.createElement('li');
    item.className = 'history-card';
    item.textContent = 'No history yet.';
    historyList.appendChild(item);
    return;
  }

  history.forEach((entry) => {
    const isViewerLender = entry.role === 'lender';
    const counterpartyName = isViewerLender
      ? (entry.borrower_full_name || entry.borrower_username || 'Borrower')
      : (entry.lender_full_name || entry.lender_username || 'Lender');
    const counterpartyRole = isViewerLender ? 'Borrower' : 'Lender';
    const counterpartyId = isViewerLender ? entry.borrower_id : entry.lender_id;
    const timeLabel = entry.pickup_start_time && entry.pickup_end_time
      ? `${entry.pickup_start_time} - ${entry.pickup_end_time}`
      : 'Time unavailable';
    const dueDateLabel = formatDateLabel(entry.due_date);
    const statusLabel = entry.display_status || entry.transaction_stage || entry.status;
    const statusKey = entry.transaction_stage || entry.loan_state || entry.status;

    const item = document.createElement('li');
    item.className = 'history-card';
    const top = createElement('div', { className: 'history-top' });
    top.appendChild(createElement('strong', { textContent: entry.product_name || 'Item' }));
    top.appendChild(createStatusBadge(statusKey, statusLabel));
    item.appendChild(top);
    appendPlainParagraph(
      item,
      isViewerLender ? 'You lent this item' : 'You requested this item',
      'subtitle'
    );
    appendLabeledParagraph(item, counterpartyRole, counterpartyName);
    appendLabeledParagraph(item, 'Daily price', formatPrice(entry.daily_price));
    appendLabeledParagraph(
      item,
      'Pickup',
      `${entry.pickup_location || 'Location unavailable'} (${timeLabel})`
    );
    appendLabeledParagraph(item, 'Due date', dueDateLabel);
    appendStatusDetails(item, entry);
    appendLabeledParagraph(item, 'Recorded', formatDateTimeLabel(entry.created_at));

    if (Number.isInteger(Number(counterpartyId)) && Number(counterpartyId) > 0) {
      const actions = document.createElement('div');
      actions.className = 'history-card-actions';

      actions.appendChild(
        createProfileLinkButton(
          counterpartyId,
          entry.id,
          `View ${counterpartyRole.toLowerCase()} profile`
        )
      );

      item.appendChild(actions);
    }

    historyList.appendChild(item);
  });
}

async function loadOwnProfile() {
  try {
    const [me, ratingData, history] = await Promise.all([
      getJson('/api/me'),
      getJson('/api/ratings/me'),
      getJson('/api/history/me')
    ]);

    setPageMode({ isSelf: true });
    renderProfile(me, ratingData, { isSelf: true });
    renderHistory(history || []);
    populateProfileForm(me);
  } catch (error) {
    setProfileUnavailable('Unable to load profile.', { isSelf: true });
  }
}

async function loadCounterpartProfile() {
  if (!Number.isInteger(viewedUserId) || viewedUserId <= 0) {
    setProfileUnavailable('Invalid profile request.', { isSelf: false });
    return;
  }

  try {
    const interactionSuffix = Number.isInteger(viewedInteractionId) && viewedInteractionId > 0
      ? `?interaction=${encodeURIComponent(String(viewedInteractionId))}`
      : '';
    const payload = await getJson(`/api/users/${viewedUserId}/profile${interactionSuffix}`);

    if (payload.isSelf) {
      await loadOwnProfile();
      return;
    }

    setPageMode({
      isSelf: false,
      user: payload.user
    });
    renderProfile(payload.user, payload.ratings, { isSelf: false });
    historyList.replaceChildren();
  } catch (error) {
    setProfileUnavailable(error.message || 'Unable to load profile.', { isSelf: false });
  }
}

logoutButton.addEventListener('click', logout);
profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  profileMessage.textContent = '';

  const username = profileDisplayNameInput.value.trim();
  const fullName = profileFullNameInput.value.trim();
  const email = profileEmailInput.value.trim();
  const phone = profilePhoneInput.value.trim();
  const country = profileCountryInput.value.trim();
  const address = profileAddressInput.value.trim();

  if (!username) {
    profileMessage.textContent = 'Display name is required.';
    return;
  }

  if (username.length > 40) {
    profileMessage.textContent = 'Display name must be 40 characters or fewer.';
    return;
  }

  if (!fullName) {
    profileMessage.textContent = 'Full name is required.';
    return;
  }

  if (fullName.length > 80) {
    profileMessage.textContent = 'Full name must be 80 characters or fewer.';
    return;
  }

  if (!isValidUpeiEmail(email)) {
    profileMessage.textContent = 'Please use your @upei.ca email address.';
    return;
  }

  const countryMessage = getCountryValidationMessage(country);

  if (countryMessage) {
    profileMessage.textContent = countryMessage;
    return;
  }

  const addressMessage = getAddressValidationMessage(address);

  if (addressMessage) {
    profileMessage.textContent = addressMessage;
    return;
  }

  const phoneMessage = getPhoneValidationMessage(phone);

  if (phoneMessage) {
    profileMessage.textContent = phoneMessage;
    return;
  }

  try {
    await postJson('/api/me', {
      username,
      fullName,
      email,
      phone,
      country,
      address
    });
    profileMessage.textContent = 'Profile updated.';
    await loadOwnProfile();
  } catch (error) {
    profileMessage.textContent = error.message || 'Unable to update profile.';
  }
});

if (viewedUserParam) {
  loadCounterpartProfile();
} else {
  loadOwnProfile();
}
