import { getAllPages, getJson, postForm } from './api.js';
import { getOwnedProducts, removeListing, renderCardGrid } from './catalog.mjs';
import { mountShell } from './layout.mjs';
import { renderSkeletons, showToast } from './ui.mjs';
import {
  MAX_PRODUCT_IMAGE_COUNT,
  createProductImagePreviewCard,
  createProductListingFormData,
  validateSelectedProductImages
} from './productImageForm.mjs';

mountShell({ current: 'listings' });

const myListingsGrid = document.getElementById('myListingsGrid');
const myListingCountLabel = document.getElementById('myListingCountLabel');
const onLoanCountLabel = document.getElementById('onLoanCountLabel');
const lendSection = document.getElementById('lendSection');
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

  myListingCountLabel.textContent = String(ownedProducts.length);
  onLoanCountLabel.textContent = String(
    ownedProducts.filter((product) => product.Product_Borrower_ID).length
  );
}

async function loadProfile() {
  const me = await getJson('/api/me');
  currentUserId = me.id;
}

async function loadProducts() {
  listingMessage.textContent = '';

  try {
    products = await getAllPages('/api/products');
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
    showToast('Listing removed from your active shelf.');
  } catch (error) {
    showToast(error.message || 'Unable to remove listing.', 'error');
  }
}

const pickupWindowRows = document.getElementById('pickupWindowRows');
const availabilityRows = document.getElementById('availabilityRows');

// Small repeatable-row builder shared by the two optional sections. Rows are
// read back out of the DOM at submit time rather than mirrored into state, so
// there is one source of truth for what the lender typed.
function createRepeatRow(fields) {
  const row = document.createElement('div');
  row.className = 'repeat-row';

  fields.forEach((field) => {
    const control = document.createElement(field.tag || 'input');

    if (field.tag === 'select') {
      field.options.forEach((option) => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        control.appendChild(optionElement);
      });
    } else {
      control.type = field.type;

      if (field.placeholder) {
        control.placeholder = field.placeholder;
      }

      if (field.maxLength) {
        control.maxLength = field.maxLength;
      }
    }

    control.dataset.role = field.role;
    control.setAttribute('aria-label', field.label);
    row.appendChild(control);
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'ghost';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => row.remove());
  row.appendChild(remove);

  return row;
}

function addPickupWindowRow() {
  pickupWindowRows.appendChild(createRepeatRow([
    { role: 'location', type: 'text', label: 'Pickup location', placeholder: 'Robertson Library desk', maxLength: 80 },
    { role: 'startTime', type: 'time', label: 'Window start' },
    { role: 'endTime', type: 'time', label: 'Window end' }
  ]));
}

function addAvailabilityRow() {
  availabilityRows.appendChild(createRepeatRow([
    {
      role: 'kind',
      tag: 'select',
      label: 'Range type',
      options: [
        { value: 'available', label: 'Available' },
        { value: 'blackout', label: 'Blocked out' }
      ]
    },
    { role: 'startDate', type: 'date', label: 'Range start' },
    { role: 'endDate', type: 'date', label: 'Range end' }
  ]));
}

function readRepeatRows(container, roles) {
  return Array.from(container.querySelectorAll('.repeat-row')).map((row) => {
    const entry = {};

    roles.forEach((role) => {
      entry[role] = row.querySelector(`[data-role="${role}"]`)?.value.trim() || '';
    });

    return entry;
  }).filter((entry) => roles.some((role) => entry[role]));
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

  const pickupWindows = readRepeatRows(pickupWindowRows, ['location', 'startTime', 'endTime']);
  const availability = readRepeatRows(availabilityRows, ['kind', 'startDate', 'endDate']);

  try {
    const formData = createProductListingFormData({
      name,
      price,
      condition,
      description,
      // Only send these when the lender filled something in, so an untouched form
      // still means "defaults and always available".
      ...(pickupWindows.length ? { pickupWindows: JSON.stringify(pickupWindows) } : {}),
      ...(availability.length ? { availability: JSON.stringify(availability) } : {})
    }, imageValidation.files, selectedCoverIndex);

    await postForm('/api/products', formData);

    lendForm.reset();
    pickupWindowRows.replaceChildren();
    availabilityRows.replaceChildren();
    resetSelectedImages();
    lendSection.open = false;
    showToast('Item listed. It now appears in your lending shelf.');
    await loadProducts();
  } catch (error) {
    lendMessage.textContent = error.message || 'Unable to add item.';
  }
}

lendForm.addEventListener('submit', handleLendSubmit);
document.getElementById('addPickupWindow').addEventListener('click', addPickupWindowRow);
document.getElementById('addAvailability').addEventListener('click', addAvailabilityRow);
productImageFilesInput.addEventListener('change', handleSelectedImages);
renderSelectedImagePreviews();
renderSkeletons(myListingsGrid, 3, 'card');

try {
  await loadProfile();
  await loadProducts();
} catch (error) {
  listingMessage.textContent = error.message || 'Unable to load your listings.';
}
