/* Product catalog: filtering, card grids, and listing removal. */

import { postJson } from './api.js';
import { formatPrice, redirectTo } from './format.mjs';
import { createEmptyState, createProductCard as buildProductCard } from './rendering.mjs';

export { createEmptyState };

function matchesSearch(product, searchValue) {
  if (!searchValue) {
    return true;
  }

  return product.Product_Name.toLowerCase().includes(searchValue)
    || (product.Product_Description || '').toLowerCase().includes(searchValue)
    || (product.Product_Condition || '').toLowerCase().includes(searchValue);
}

export function getOwnedProducts(products, currentUserId) {
  if (!currentUserId) {
    return [];
  }

  return products.filter((product) => Number(product.Product_Lender_ID) === Number(currentUserId));
}

export function getCatalogProducts(products, currentUserId, searchValue = '', filter = 'all') {
  const normalizedSearch = searchValue.trim().toLowerCase();

  return products.filter((product) => {
    const isOwnedByCurrentUser = currentUserId
      && Number(product.Product_Lender_ID) === Number(currentUserId);

    if (isOwnedByCurrentUser || product.Product_Borrower_ID) {
      return false;
    }

    if (filter === 'budget' && Number(product.Product_Lending_Charge) > 10) {
      return false;
    }

    if (filter === 'excellent' && product.Product_Condition !== 'Excellent') {
      return false;
    }

    return matchesSearch(product, normalizedSearch);
  });
}

function getOwnerStatusLabel(product) {
  if (!product.Product_Borrower_ID) {
    return 'Listed';
  }

  const stage = product.Current_Transaction_Status || product.current_transaction_status || '';
  return stage === 'approved' ? 'Reserved' : 'On Loan';
}

export function createProductCard(product, { ownerView = false, onRemove = null } = {}) {
  return buildProductCard(product, {
    ownerView,
    statusLabel: ownerView ? getOwnerStatusLabel(product) : 'Available',
    formatPrice,
    onRemove,
    onSelect: () => redirectTo(`/product/${product.Product_ID}`)
  });
}

export function renderCardGrid(gridElement, items, emptyTitle, emptyMessage, options = {}) {
  const fragment = document.createDocumentFragment();

  if (!items.length) {
    fragment.appendChild(createEmptyState(emptyTitle, emptyMessage));
  } else {
    items.forEach((item) => fragment.appendChild(createProductCard(item, options)));
  }

  gridElement.replaceChildren(fragment);
}

export async function removeListing(product) {
  if (!product || !Number.isInteger(Number(product.Product_ID))) {
    throw new Error('Unable to remove this listing.');
  }

  const confirmed = window.confirm(
    `Remove "${product.Product_Name}" from your active listings? Pending requests will be rejected.`
  );

  if (!confirmed) {
    return false;
  }

  await postJson(`/api/products/${product.Product_ID}/remove`, {});
  return true;
}
