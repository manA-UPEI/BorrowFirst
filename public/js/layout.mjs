import { getJson, postJson } from './api.js';
import { createElement } from './rendering.mjs';

const NAV_ITEMS = [
  { key: 'home', href: '/home', label: 'Home' },
  { key: 'requests', href: '/requests', label: 'Requests', badge: 'pending' },
  { key: 'borrowing', href: '/borrowing', label: 'Borrowing' },
  { key: 'listings', href: '/listings', label: 'Listings' }
];

function getInitials(user) {
  const source = (user.full_name || user.username || '').trim();

  if (!source) {
    return '--';
  }

  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function buildBrand() {
  const brand = createElement('a', {
    className: 'brand',
    attributes: { href: '/home', 'aria-label': 'BorrowFirst home' }
  });
  brand.appendChild(createElement('span', { className: 'brand-mark', textContent: 'BF' }));
  brand.appendChild(createElement('span', { className: 'brand-name', textContent: 'BorrowFirst' }));
  return brand;
}

function buildNav(current) {
  const nav = createElement('nav', {
    className: 'topnav',
    attributes: { 'aria-label': 'Primary' }
  });

  NAV_ITEMS.forEach((item) => {
    const isCurrent = item.key === current;
    const link = createElement('a', {
      className: isCurrent ? 'is-current' : '',
      textContent: item.label,
      attributes: {
        href: item.href,
        'aria-current': isCurrent ? 'page' : undefined
      }
    });

    if (item.badge) {
      link.appendChild(createElement('span', {
        className: 'nav-badge hidden',
        attributes: { id: 'navPendingBadge' }
      }));
    }

    nav.appendChild(link);
  });

  return nav;
}

function buildUserChip() {
  const chip = createElement('a', {
    className: 'user-chip',
    attributes: { href: '/profile', id: 'navUserChip' }
  });
  chip.appendChild(createElement('span', {
    className: 'avatar',
    attributes: { id: 'navAvatar', 'aria-hidden': 'true' }
  }));
  chip.appendChild(createElement('span', { attributes: { id: 'navUserName' } }));
  return chip;
}

function buildLogoutButton(onLogout) {
  const button = createElement('button', {
    className: 'ghost',
    textContent: 'Log out',
    attributes: { id: 'logoutButton', type: 'button' }
  });
  button.addEventListener('click', onLogout);
  return button;
}

async function logout() {
  try {
    await postJson('/api/logout', {});
  } finally {
    window.location.href = '/login';
  }
}

async function hydrateUser() {
  const avatar = document.getElementById('navAvatar');
  const name = document.getElementById('navUserName');

  if (!avatar || !name) {
    return;
  }

  try {
    const me = await getJson('/api/me');
    avatar.textContent = getInitials(me);
    name.textContent = me.username || me.full_name || 'Account';
  } catch (error) {
    document.getElementById('navUserChip')?.classList.add('hidden');
  }
}

async function refreshPendingBadge() {
  const badge = document.getElementById('navPendingBadge');

  if (!badge) {
    return;
  }

  try {
    const notifications = await getJson('/api/notifications');
    const pending = notifications.filter((item) => item.status === 'pending').length;

    badge.textContent = pending > 99 ? '99+' : String(pending);
    badge.classList.toggle('hidden', pending === 0);
  } catch (error) {
    badge.classList.add('hidden');
  }
}

/**
 * Renders the shared top bar into #appShell and takes ownership of logout,
 * the signed-in user chip, and the pending-request badge.
 */
export function mountShell({ current = '' } = {}) {
  const mountPoint = document.getElementById('appShell');

  if (!mountPoint) {
    return;
  }

  const header = createElement('header', { className: 'topbar' });
  const inner = createElement('div', { className: 'topbar-inner' });
  const end = createElement('div', { className: 'topbar-end' });

  end.appendChild(buildUserChip());
  end.appendChild(buildLogoutButton(logout));

  inner.appendChild(buildBrand());
  inner.appendChild(buildNav(current));
  inner.appendChild(end);
  header.appendChild(inner);

  mountPoint.replaceWith(header);

  hydrateUser();
  refreshPendingBadge();
  window.setInterval(refreshPendingBadge, 20000);
}
