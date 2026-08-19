import { getJson } from './api.js';
import { loadEligibleUsers, submitNotificationAction, submitRating } from './actions.mjs';
import { createTransactionCard, getStageKey } from './cards.mjs';
import { mountShell } from './layout.mjs';
import { createElement, createEmptyState } from './rendering.mjs';
import { renderSkeletons, showToast } from './ui.mjs';

mountShell({ current: 'borrowing' });

const transactionList = document.getElementById('transactionList');
const transactionMessage = document.getElementById('transactionMessage');
const transactionCount = document.getElementById('transactionCount');
const loanAlertList = document.getElementById('loanAlertList');
const loanAlertMessage = document.getElementById('loanAlertMessage');
const alertCount = document.getElementById('alertCount');
const borrowStats = document.getElementById('borrowStats');
const rateForm = document.getElementById('rateForm');
const rateUser = document.getElementById('rateUser');
const ratingValue = document.getElementById('ratingValue');
const rateMessage = document.getElementById('rateMessage');

const rateElements = {
  rateUser,
  ratingValue,
  rateSubmitButton: rateForm.querySelector('button[type="submit"]'),
  rateMessage
};

const URGENT_STAGES = ['overdue', 'due_today', 'awaiting_return_confirmation'];

function renderStats(transactions) {
  const urgent = transactions.filter((item) => URGENT_STAGES.includes(getStageKey(item))).length;
  const active = transactions.filter((item) => getStageKey(item) === 'active').length;
  const fragment = document.createDocumentFragment();

  [
    ['on loan', active],
    ['needs attention', urgent]
  ].forEach(([label, count]) => {
    if (!count) {
      return;
    }

    const chip = createElement('span', {
      className: label === 'needs attention' ? 'stat-chip is-urgent' : 'stat-chip'
    });
    chip.appendChild(createElement('strong', { textContent: String(count) }));
    chip.appendChild(createElement('span', { textContent: label }));
    fragment.appendChild(chip);
  });

  borrowStats.replaceChildren(fragment);
}

function renderList(container, items, role, emptyTitle, emptyMessage) {
  const fragment = document.createDocumentFragment();

  if (!items.length) {
    fragment.appendChild(createEmptyState(emptyTitle, emptyMessage));
  } else {
    items.forEach((item) => {
      fragment.appendChild(createTransactionCard(item, {
        role,
        onAction: handleNotificationAction
      }));
    });
  }

  container.replaceChildren(fragment);
}

async function loadTransactions() {
  transactionMessage.textContent = '';

  try {
    const transactions = await getJson('/api/transactions/me');
    const mine = transactions.filter((transaction) => transaction.role === 'borrower');

    transactionCount.textContent = String(mine.length);
    renderStats(mine);
    renderList(
      transactionList,
      mine,
      'borrower',
      'No borrower transactions',
      'Your requests, pickup codes, and active borrowed items will appear here.'
    );
  } catch (error) {
    transactionMessage.textContent = error.message || 'Unable to load your transactions.';
  }
}

async function loadAlerts() {
  loanAlertMessage.textContent = '';

  try {
    const alerts = await getJson('/api/alerts/me');

    alertCount.textContent = String(alerts.length);
    renderList(
      loanAlertList,
      alerts,
      'alert',
      'No loan alerts',
      'No pickup, due-date, or return-verification alerts are waiting right now.'
    );
  } catch (error) {
    loanAlertMessage.textContent = error.message || 'Unable to load loan alerts.';
  }
}

async function handleNotificationAction(notificationId, action, payload = {}) {
  try {
    const successMessage = await submitNotificationAction(notificationId, action, payload);
    await Promise.all([loadTransactions(), loadAlerts(), loadEligibleUsers(rateElements)]);
    showToast(successMessage);
  } catch (error) {
    showToast(error.message || 'Unable to update transaction.', 'error');
  }
}

async function handleRateSubmit(event) {
  event.preventDefault();
  rateMessage.textContent = '';

  if (!rateUser.value) {
    rateMessage.textContent = 'Please choose a user to rate.';
    return;
  }

  try {
    await submitRating(rateUser.value, ratingValue.value);
    await loadEligibleUsers(rateElements);
    showToast('Rating saved.');
  } catch (error) {
    rateMessage.textContent = error.message || 'Unable to submit rating.';
  }
}

rateForm.addEventListener('submit', handleRateSubmit);

renderSkeletons(loanAlertList, 2);
renderSkeletons(transactionList, 3);

await Promise.all([loadTransactions(), loadAlerts(), loadEligibleUsers(rateElements)]);
window.setInterval(loadTransactions, 10000);
window.setInterval(loadAlerts, 15000);
window.setInterval(() => loadEligibleUsers(rateElements), 30000);
