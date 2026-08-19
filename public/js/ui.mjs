/* Shared feedback UI: toasts for action results, skeletons for loading. */

import { createElement } from './rendering.mjs';

const TOAST_MS = 4000;
let toastRegion = null;

function getToastRegion() {
  if (toastRegion && toastRegion.isConnected) {
    return toastRegion;
  }

  toastRegion = createElement('div', {
    className: 'toast-region',
    attributes: { role: 'status', 'aria-live': 'polite' }
  });
  document.body.appendChild(toastRegion);
  return toastRegion;
}

/**
 * Shows a transient message.
 * @param {string} message
 * @param {'success'|'error'} tone
 */
export function showToast(message, tone = 'success') {
  if (!message) {
    return;
  }

  const toast = createElement('div', {
    className: `toast toast-${tone === 'error' ? 'error' : 'success'}`,
    textContent: message
  });

  getToastRegion().appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('is-leaving');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    window.setTimeout(() => toast.remove(), 400);
  }, TOAST_MS);
}

/** Fills a container with placeholder cards while real data loads. */
export function renderSkeletons(container, count = 3, variant = 'row') {
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < count; index += 1) {
    fragment.appendChild(createElement('div', { className: `skeleton skeleton-${variant}` }));
  }

  container.replaceChildren(fragment);
}

/**
 * Wires a set of filter chips. Calls onChange with the selected value.
 * @returns {() => string} reads the current value
 */
export function bindFilterChips(container, onChange) {
  if (!container) {
    return () => '';
  }

  let value = container.querySelector('.chip.is-active')?.dataset.filter || '';

  container.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');

    if (!chip || chip.dataset.filter === value) {
      return;
    }

    container.querySelectorAll('.chip').forEach((node) => {
      const isActive = node === chip;
      node.classList.toggle('is-active', isActive);
      node.setAttribute('aria-pressed', String(isActive));
    });

    value = chip.dataset.filter;
    onChange(value);
  });

  return () => value;
}
