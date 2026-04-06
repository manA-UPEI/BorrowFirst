export const DEFAULT_PRODUCT_IMAGE = '/images/campus-placeholder.svg';

const SAFE_STATUS_KEYS = new Set([
  'pending',
  'awaiting_pickup',
  'active',
  'due_today',
  'overdue',
  'awaiting_return_confirmation',
  'returned',
  'rejected',
  'cancelled'
]);
const SAFE_DATA_IMAGE_PREFIXES = [
  'data:image/png;base64,',
  'data:image/jpeg;base64,',
  'data:image/webp;base64,',
  'data:image/gif;base64,'
];

export function getStatusClassKey(value) {
  return SAFE_STATUS_KEYS.has(value) ? value : 'pending';
}

export function createElement(tagName, { className = '', textContent = '', attributes = {} } = {}) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (textContent) {
    element.textContent = textContent;
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      element.setAttribute(key, String(value));
    }
  });

  return element;
}

export function appendText(element, text) {
  element.appendChild(document.createTextNode(text));
}

export function appendLabeledParagraph(container, label, value, className = '') {
  const paragraph = createElement('p', { className });
  const strong = createElement('strong', { textContent: `${label}:` });
  paragraph.appendChild(strong);
  appendText(paragraph, ` ${value}`);
  container.appendChild(paragraph);
  return paragraph;
}

export function appendPlainParagraph(container, text, className = '') {
  const paragraph = createElement('p', { className, textContent: text });
  container.appendChild(paragraph);
  return paragraph;
}

export function createStatusBadge(statusKey, statusLabel) {
  return createElement('span', {
    className: `status-badge history-status history-${getStatusClassKey(statusKey)}`,
    textContent: statusLabel
  });
}

export function renderSummary(container, items) {
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const wrapper = createElement('div');
    wrapper.appendChild(createElement('span', {
      className: 'summary-label',
      textContent: item.label
    }));
    wrapper.appendChild(createElement('span', {
      className: 'summary-value',
      textContent: item.value
    }));
    fragment.appendChild(wrapper);
  });

  container.replaceChildren(fragment);
}

export function createEmptyState(title, message) {
  const emptyState = createElement('div', { className: 'grid-empty' });
  emptyState.appendChild(createElement('strong', { textContent: title }));
  emptyState.appendChild(createElement('p', { textContent: message }));
  return emptyState;
}

function isSafeStaticImagePath(value) {
  return typeof value === 'string'
    && /^\/images\/[A-Za-z0-9._/-]+$/.test(value)
    && !value.includes('..')
    && !value.includes('\\');
}

function isSafeCloudinaryImageUrl(value) {
  return typeof value === 'string'
    && /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/.+$/i.test(value.trim());
}

function isSafeDataImageUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase();
  return SAFE_DATA_IMAGE_PREFIXES.some((prefix) => normalizedValue.startsWith(prefix));
}

export function resolveClientImageSrc(value, fallback = DEFAULT_PRODUCT_IMAGE) {
  if (isSafeStaticImagePath(value) || isSafeCloudinaryImageUrl(value) || isSafeDataImageUrl(value)) {
    return value;
  }

  return fallback;
}

export function setImageSource(image, value, alt, fallback = DEFAULT_PRODUCT_IMAGE) {
  image.src = resolveClientImageSrc(value, fallback);
  image.alt = alt || 'Product image';
  image.addEventListener('error', () => {
    image.src = fallback;
  }, { once: true });
}

export function createRatingRow(label, rating) {
  const item = createElement('li', { className: 'rating-row' });
  item.appendChild(createElement('span', { textContent: label }));
  item.appendChild(createElement('span', {
    className: 'rating-badge',
    textContent: `${rating}/5`
  }));
  return item;
}

export function createProductCard(product, {
  ownerView = false,
  statusLabel = 'Available',
  formatPrice = (value) => String(value),
  onRemove = null,
  onSelect = null
} = {}) {
  const isAvailable = !product.Product_Borrower_ID;
  const description = product.Product_Description || 'No description provided.';
  const condition = product.Product_Condition || 'N/A';
  const card = createElement('article', {
    className: `card ${ownerView ? 'card-owned' : 'card-browse'}`
  });
  const media = createElement('div', { className: 'card-media' });
  const image = createElement('img');
  const badge = createElement('span', {
    className: `status-badge ${isAvailable ? 'status-available' : 'status-unavailable'} card-overlay`,
    textContent: statusLabel
  });
  const copy = createElement('div', { className: 'card-copy' });
  const topLine = createElement('div', { className: 'card-topline' });

  setImageSource(image, product.Product_Url, product.Product_Name || 'Product image');
  media.appendChild(image);
  media.appendChild(badge);

  topLine.appendChild(createElement('h3', { textContent: product.Product_Name || 'Product' }));

  if (ownerView) {
    topLine.appendChild(createElement('span', {
      className: 'meta-pill',
      textContent: 'Your listing'
    }));
  }

  copy.appendChild(topLine);
  copy.appendChild(createElement('p', {
    className: 'card-description',
    textContent: description
  }));

  const meta = createElement('div', { className: 'card-meta' });
  meta.appendChild(createElement('span', {
    textContent: formatPrice(product.Product_Lending_Charge)
  }));
  meta.appendChild(createElement('span', { textContent: condition }));
  copy.appendChild(meta);

  if (ownerView) {
    const actions = createElement('div', { className: 'card-actions' });
    const removeButton = createElement('button', {
      className: 'button-danger',
      textContent: isAvailable ? 'Remove listing' : statusLabel
    });
    removeButton.type = 'button';
    removeButton.disabled = !isAvailable;
    removeButton.addEventListener('click', (event) => {
      event.stopPropagation();

      if (!isAvailable || typeof onRemove !== 'function') {
        return;
      }

      onRemove(product);
    });
    actions.appendChild(removeButton);
    copy.appendChild(actions);
  }

  card.appendChild(media);
  card.appendChild(copy);

  if (typeof onSelect === 'function') {
    card.addEventListener('click', () => onSelect(product));
  }

  return card;
}
