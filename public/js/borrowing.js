import { getJson } from './api.js';
import {
  createEmptyState,
  loadEligibleUsers,
  submitNotificationAction,
  submitRating
} from './dashboardShared.js';
import {
  createBorrowerTransactionCard,
  createLoanAlertCard,
  logout
} from './helpers.js';

const logoutButton = document.getElementById('logoutButton');
const transactionList = document.getElementById('transactionList');
const transactionMessage = document.getElementById('transactionMessage');
const loanAlertList = document.getElementById('loanAlertList');
const loanAlertMessage = document.getElementById('loanAlertMessage');
const rateForm = document.getElementById('rateForm');
const rateUser = document.getElementById('rateUser');
const ratingValue = document.getElementById('ratingValue');
const rateMessage = document.getElementById('rateMessage');
const rateSubmitButton = rateForm.querySelector('button[type="submit"]');

const rateElements = {
  rateUser,
  ratingValue,
  rateSubmitButton,
  rateMessage
};

function getBorrowerTransactions(transactions) {
  return transactions.filter((transaction) => transaction.role === 'borrower');
}

async function loadTransactions() {
  transactionMessage.textContent = '';

  try {
    const transactions = await getJson('/api/transactions/me');
    const borrowerTransactions = getBorrowerTransactions(transactions);
    const nextContent = document.createDocumentFragment();

    if (!borrowerTransactions.length) {
      nextContent.appendChild(
        createEmptyState(
          'No borrower transactions',
          'Your requests, pickup codes, and active borrowed items will appear here.'
        )
      );
      transactionList.replaceChildren(nextContent);
      return;
    }

    borrowerTransactions.forEach((transaction) => {
      nextContent.appendChild(createBorrowerTransactionCard(transaction, handleNotificationAction));
    });

    transactionList.replaceChildren(nextContent);
  } catch (error) {
    transactionMessage.textContent = error.message || 'Unable to load your transactions.';
  }
}

async function loadAlerts() {
  loanAlertMessage.textContent = '';

  try {
    const alerts = await getJson('/api/alerts/me');
    const nextContent = document.createDocumentFragment();

    if (!alerts.length) {
      nextContent.appendChild(
        createEmptyState(
          'No loan alerts',
          'No pickup, due-date, or return-verification alerts are waiting right now.'
        )
      );
      loanAlertList.replaceChildren(nextContent);
      return;
    }

    alerts.forEach((alert) => {
      nextContent.appendChild(createLoanAlertCard(alert));
    });

    loanAlertList.replaceChildren(nextContent);
  } catch (error) {
    loanAlertMessage.textContent = error.message || 'Unable to load loan alerts.';
  }
}

async function handleNotificationAction(notificationId, action, payload = {}, context = 'transactions') {
  transactionMessage.textContent = '';
  loanAlertMessage.textContent = '';

  try {
    const successMessage = await submitNotificationAction(notificationId, action, payload);
    await Promise.all([loadTransactions(), loadAlerts(), loadEligibleUsers(rateElements)]);

    if (context === 'transactions' || action === 'issue_return_code') {
      transactionMessage.textContent = successMessage;
      return;
    }

    loanAlertMessage.textContent = successMessage;
  } catch (error) {
    const message = error.message || 'Unable to update transaction.';

    if (context === 'transactions' || action === 'issue_return_code') {
      transactionMessage.textContent = message;
      return;
    }

    loanAlertMessage.textContent = message;
  }
}

async function handleRateSubmit(event) {
  event.preventDefault();
  rateMessage.textContent = '';

  const userId = rateUser.value;
  const rating = ratingValue.value;

  if (!userId) {
    rateMessage.textContent = 'Please choose a user to rate.';
    return;
  }

  try {
    await submitRating(userId, rating);
    rateMessage.textContent = 'Rating saved.';
    await loadEligibleUsers(rateElements);
  } catch (error) {
    rateMessage.textContent = error.message || 'Unable to submit rating.';
  }
}

logoutButton.addEventListener('click', logout);
rateForm.addEventListener('submit', handleRateSubmit);

await Promise.all([
  loadTransactions(),
  loadAlerts(),
  loadEligibleUsers(rateElements)
]);
window.setInterval(loadTransactions, 10000);
window.setInterval(loadAlerts, 15000);
window.setInterval(() => {
  loadEligibleUsers(rateElements);
}, 30000);
