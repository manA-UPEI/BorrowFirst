import { getJson } from './api.js';
import {
  createEmptyState,
  getCatalogProducts,
  getOwnedProducts,
  renderCardGrid
} from './dashboardShared.js';
import { logout } from './helpers.js';

const logoutButton = document.getElementById('logoutButton');
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

function updateHomeMetrics() {
  const ownedProducts = getOwnedProducts(products, currentUserId);
  const visibleCatalogProducts = getCatalogProducts(products, currentUserId, searchInput.value);
  const pendingNotifications = notifications.filter((notification) => notification.status === 'pending');

  availableCount.textContent = String(visibleCatalogProducts.length);
  myListingCount.textContent = String(ownedProducts.length);
  pendingCount.textContent = String(pendingNotifications.length);
  availableCountLabel.textContent = `${visibleCatalogProducts.length} item${visibleCatalogProducts.length === 1 ? '' : 's'}`;
}

function renderProducts() {
  const catalogProducts = getCatalogProducts(products, currentUserId, searchInput.value);

  renderCardGrid(
    productGrid,
    catalogProducts,
    'No available products',
    searchInput.value.trim()
      ? 'Try a different search term. Reserved and borrowed items are hidden from this catalog.'
      : 'Reserved and borrowed items are hidden here. Check back after more listings are added.'
  );

  updateHomeMetrics();
}

async function loadProfile() {
  try {
    const me = await getJson('/api/me');
    currentUserId = me.id;
    updateHomeMetrics();
  } catch (error) {
    currentUserId = null;
  }
}

async function loadProducts() {
  productMessage.textContent = '';

  try {
    products = await getJson('/api/products');
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

  updateHomeMetrics();
}

logoutButton.addEventListener('click', logout);
searchInput.addEventListener('input', renderProducts);

await loadProfile();
await Promise.all([loadProducts(), loadNotificationCounts()]);
window.setInterval(loadNotificationCounts, 10000);
window.setInterval(loadProducts, 15000);
