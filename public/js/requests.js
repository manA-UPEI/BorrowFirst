import { getJson } from './api.js';
import { submitNotificationAction } from './actions.mjs';
import { createTransactionCard, getStageKey } from './cards.mjs';
import { mountShell } from './layout.mjs';
import { createElement, createEmptyState } from './rendering.mjs';
import { renderSkeletons, showToast } from './ui.mjs';

mountShell({ current: 'requests' });

const requestGroups = document.getElementById('requestGroups');
const requestStats = document.getElementById('requestStats');
const notificationMessage = document.getElementById('notificationMessage');

const GROUPS = [
  {
    key: 'pending',
    title: 'Needs approval',
    stages: ['pending'],
    empty: 'No requests are waiting on your decision.'
  },
  {
    key: 'awaiting_pickup',
    title: 'Awaiting pickup',
    stages: ['awaiting_pickup'],
    empty: 'No approved reservations are waiting for handoff.'
  },
  {
    key: 'active',
    title: 'On loan',
    stages: ['active', 'due_today', 'overdue'],
    empty: 'Nothing is out on loan right now.'
  },
  {
    key: 'returning',
    title: 'Awaiting return confirmation',
    stages: ['awaiting_return_confirmation'],
    empty: 'No returns are waiting on your confirmation.'
  }
];

function renderStats(notifications) {
  const fragment = document.createDocumentFragment();

  GROUPS.forEach((group) => {
    const count = notifications.filter((item) => group.stages.includes(getStageKey(item))).length;

    if (!count) {
      return;
    }

    const stat = createElement('span', { className: 'stat-chip' });
    stat.appendChild(createElement('strong', { textContent: String(count) }));
    stat.appendChild(createElement('span', { textContent: group.title.toLowerCase() }));
    fragment.appendChild(stat);
  });

  requestStats.replaceChildren(fragment);
}

function createGroupSection(group, items) {
  const section = createElement('section', { className: 'panel section-panel' });
  const header = createElement('div', { className: 'section-header' });
  const heading = createElement('div');

  heading.appendChild(createElement('h2', { textContent: group.title }));
  header.appendChild(heading);
  header.appendChild(createElement('span', {
    className: 'section-count',
    textContent: String(items.length)
  }));
  section.appendChild(header);

  const list = createElement('div', { className: 'stack' });

  items.forEach((item) => {
    list.appendChild(createTransactionCard(item, {
      role: 'lender',
      onAction: handleNotificationAction
    }));
  });

  section.appendChild(list);
  return section;
}

function renderGroups(notifications) {
  const fragment = document.createDocumentFragment();
  let rendered = 0;

  GROUPS.forEach((group) => {
    const items = notifications.filter((item) => group.stages.includes(getStageKey(item)));

    if (!items.length) {
      return;
    }

    rendered += 1;
    fragment.appendChild(createGroupSection(group, items));
  });

  if (!rendered) {
    fragment.appendChild(createEmptyState(
      'No request actions',
      'No lender-side requests or verification steps are waiting right now.'
    ));
  }

  requestGroups.replaceChildren(fragment);
}

async function loadNotifications() {
  notificationMessage.textContent = '';

  try {
    const notifications = await getJson('/api/notifications');
    renderStats(notifications);
    renderGroups(notifications);
  } catch (error) {
    requestGroups.replaceChildren();
    notificationMessage.textContent = error.message || 'Unable to load requests.';
  }
}

async function handleNotificationAction(notificationId, action, payload = {}) {
  notificationMessage.textContent = '';

  try {
    const successMessage = await submitNotificationAction(notificationId, action, payload);
    await loadNotifications();
    showToast(successMessage);
  } catch (error) {
    showToast(error.message || 'Unable to update request.', 'error');
  }
}

renderSkeletons(requestGroups, 3, 'panel');
await loadNotifications();
window.setInterval(loadNotifications, 10000);
