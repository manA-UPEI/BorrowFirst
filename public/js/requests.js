import { getJson } from './api.js';
import { createEmptyState, submitNotificationAction } from './dashboardShared.js';
import { createNotificationCard, logout } from './helpers.js';

const notificationList = document.getElementById('notificationList');
const notificationMessage = document.getElementById('notificationMessage');
const logoutButton = document.getElementById('logoutButton');

async function loadNotifications() {
  notificationMessage.textContent = '';

  try {
    const notifications = await getJson('/api/notifications');
    const nextContent = document.createDocumentFragment();

    if (!notifications.length) {
      nextContent.appendChild(
        createEmptyState(
          'No request actions',
          'No lender-side requests or verification steps are waiting right now.'
        )
      );
      notificationList.replaceChildren(nextContent);
      return;
    }

    notifications.forEach((notification) => {
      nextContent.appendChild(createNotificationCard(notification, handleNotificationAction));
    });

    notificationList.replaceChildren(nextContent);
  } catch (error) {
    notificationMessage.textContent = error.message || 'Unable to load requests.';
  }
}

async function handleNotificationAction(notificationId, action, payload = {}) {
  notificationMessage.textContent = '';

  try {
    const successMessage = await submitNotificationAction(notificationId, action, payload);
    await loadNotifications();
    notificationMessage.textContent = successMessage;
  } catch (error) {
    notificationMessage.textContent = error.message || 'Unable to update request.';
  }
}

logoutButton.addEventListener('click', logout);

loadNotifications();
window.setInterval(loadNotifications, 10000);
