import { getAllPages, getJson } from './api.js';
import {
  createEmptyState,
  getCatalogProducts,
  getOwnedProducts,
  renderCardGrid
} from './catalog.mjs';
import { mountShell } from './layout.mjs';
import { bindFilterChips, renderSkeletons } from './ui.mjs';

mountShell({ current: 'home' });

const searchInput = document.getElementById('searchInput');
const productGrid = document.getElementById('productGrid');
const productMessage = document.getElementById('productMessage');
const availableCount = document.getElementById('availableCount');
const myListingCount = document.getElementById('myListingCount');
const pendingCount = document.getElementById('pendingCount');
const availableCountLabel = document.getElementById('availableCountLabel');

let currentUserId = null;
let products = [];
let notifications = [];

const getFilter = bindFilterChips(document.getElementById('productFilters'), renderProducts);

function getVisibleProducts() {
  return getCatalogProducts(products, currentUserId, searchInput.value, getFilter());
}

function renderProducts() {
  const visible = getVisibleProducts();
  const isFiltered = Boolean(searchInput.value.trim()) || getFilter() !== 'all';

  renderCardGrid(
    productGrid,
    visible,
    'No available products',
    isFiltered
      ? 'Try a different search term or filter. Reserved and borrowed items stay hidden.'
      : 'Reserved and borrowed items are hidden here. Check back after more listings are added.'
  );

  availableCount.textContent = String(visible.length);
  myListingCount.textContent = String(getOwnedProducts(products, currentUserId).length);
  pendingCount.textContent = String(
    notifications.filter((notification) => notification.status === 'pending').length
  );
  availableCountLabel.textContent = `${visible.length} item${visible.length === 1 ? '' : 's'}`;
}

async function loadProfile() {
  try {
    currentUserId = (await getJson('/api/me')).id;
  } catch (error) {
    currentUserId = null;
  }
}

async function loadProducts() {
  productMessage.textContent = '';

  try {
    products = await getAllPages('/api/products');
    renderProducts();
  } catch (error) {
    productGrid.replaceChildren(
      createEmptyState('Catalog unavailable', 'Unable to load available products right now.')
    );
    productMessage.textContent = error.message || 'Unable to load available products.';
  }
}

async function loadNotificationCounts() {
  try {
    notifications = await getJson('/api/notifications');
  } catch (error) {
    notifications = [];
  }

  renderProducts();
}

searchInput.addEventListener('input', renderProducts);

renderSkeletons(productGrid, 4, 'card');
await loadProfile();
await Promise.all([loadProducts(), loadNotificationCounts()]);
window.setInterval(loadNotificationCounts, 10000);
window.setInterval(loadProducts, 15000);
