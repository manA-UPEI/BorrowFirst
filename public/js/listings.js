import { getJson, postForm } from './api.js';
import {
  getOwnedProducts,
  removeListing,
  renderCardGrid
} from './dashboardShared.js';
import { logout } from './helpers.js';
import {
  MAX_PRODUCT_IMAGE_COUNT,
  createProductImagePreviewCard,
  createProductListingFormData,
  validateSelectedProductImages
} from './productImageForm.mjs';

const logoutButton = document.getElementById('logoutButton');
const myListingsGrid = document.getElementById('myListingsGrid');
const myListingCountLabel = document.getElementById('myListingCountLabel');
const listingMessage = document.getElementById('listingMessage');
const lendForm = document.getElementById('lendForm');
const lendMessage = document.getElementById('lendMessage');
const productImageFilesInput = document.getElementById('productImageFiles');
const productImagePreviewStatus = document.getElementById('productImagePreviewStatus');
const productImagePreviewList = document.getElementById('productImagePreviewList');

let currentUserId = null;
let products = [];
let selectedImageFiles = [];
let selectedCoverIndex = 0;
let previewUrls = [];
const PRODUCT_NAME_MAX_LENGTH = 100;
const PRODUCT_DESCRIPTION_MAX_LENGTH = 1000;

function revokePreviewUrls() {
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls = [];
}

function renderSelectedImagePreviews() {
  revokePreviewUrls();
  productImagePreviewList.replaceChildren();

  if (!selectedImageFiles.length) {
    productImagePreviewStatus.textContent = 'No photos selected. The placeholder image will be used.';
    return;
  }

  productImagePreviewStatus.textContent = `Choose a cover photo. ${selectedImageFiles.length}/${MAX_PRODUCT_IMAGE_COUNT} selected.`;

  selectedImageFiles.forEach((file, index) => {
    const previewUrl = URL.createObjectURL(file);

    previewUrls.push(previewUrl);
    productImagePreviewList.appendChild(createProductImagePreviewCard({
      fileName: file.name,
      previewUrl,
      index,
      isCover: index === selectedCoverIndex,
      onSelect: (nextIndex) => {
        selectedCoverIndex = nextIndex;
        renderSelectedImagePreviews();
      }
    }));
  });
}

function resetSelectedImages({ clearInput = true } = {}) {
  selectedImageFiles = [];
  selectedCoverIndex = 0;

  if (clearInput) {
    productImageFilesInput.value = '';
  }

  renderSelectedImagePreviews();
}

function handleSelectedImages() {
  const validation = validateSelectedProductImages(productImageFilesInput.files);

  if (validation.message) {
    lendMessage.textContent = validation.message;
    resetSelectedImages();
    return;
  }

  selectedImageFiles = validation.files;
  selectedCoverIndex = Math.min(selectedCoverIndex, Math.max(selectedImageFiles.length - 1, 0));
  renderSelectedImagePreviews();
}

function renderListings() {
  const ownedProducts = getOwnedProducts(products, currentUserId);

  renderCardGrid(
    myListingsGrid,
    ownedProducts,
    'No listings yet',
    'Items you add for lending will appear here so you can track what is listed, reserved, and currently out on loan.',
    { ownerView: true, onRemove: handleRemoveListing }
  );

  myListingCountLabel.textContent = `${ownedProducts.length} item${ownedProducts.length === 1 ? '' : 's'}`;
}

async function loadProfile() {
  const me = await getJson('/api/me');
  currentUserId = me.id;
}

async function loadProducts() {
  listingMessage.textContent = '';

  try {
    products = await getJson('/api/products');
    renderListings();
  } catch (error) {
    listingMessage.textContent = error.message || 'Unable to load your listings.';
  }
}

async function handleRemoveListing(product) {
  listingMessage.textContent = '';

  try {
    const removed = await removeListing(product);

    if (!removed) {
      return;
    }

    await loadProducts();
    listingMessage.textContent = 'Listing removed from your active shelf.';
  } catch (error) {
    listingMessage.textContent = error.message || 'Unable to remove listing.';
  }
}

async function handleLendSubmit(event) {
  event.preventDefault();
  lendMessage.textContent = '';

  const name = document.getElementById('productName').value.trim();
  const price = document.getElementById('productPrice').value;
  const condition = document.getElementById('productCondition').value;
  const description = document.getElementById('productDescription').value.trim();
  const imageValidation = validateSelectedProductImages(selectedImageFiles);

  if (!name) {
    lendMessage.textContent = 'Item name is required.';
    return;
  }

  if (name.length > PRODUCT_NAME_MAX_LENGTH) {
    lendMessage.textContent = `Item name must be ${PRODUCT_NAME_MAX_LENGTH} characters or fewer.`;
    return;
  }

  if (description.length > PRODUCT_DESCRIPTION_MAX_LENGTH) {
    lendMessage.textContent = `Description must be ${PRODUCT_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
    return;
  }

  if (imageValidation.message) {
    lendMessage.textContent = imageValidation.message;
    return;
  }

  try {
    const formData = createProductListingFormData({
      name,
      price,
      condition,
      description
    }, imageValidation.files, selectedCoverIndex);

    await postForm('/api/products', formData);

    lendForm.reset();
    resetSelectedImages();
    lendMessage.textContent = 'Item listed. It now appears in your lending shelf.';
    await loadProducts();
  } catch (error) {
    lendMessage.textContent = error.message || 'Unable to add item.';
  }
}

logoutButton.addEventListener('click', logout);
lendForm.addEventListener('submit', handleLendSubmit);
productImageFilesInput.addEventListener('change', handleSelectedImages);
renderSelectedImagePreviews();

try {
  await loadProfile();
  await loadProducts();
} catch (error) {
  listingMessage.textContent = error.message || 'Unable to load your listings.';
}
