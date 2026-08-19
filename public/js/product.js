import { mountShell } from './layout.mjs';
import { getJson } from './api.js';
import { formatPrice, getCurrentDateTimeLocalValue, getRouteId, getTodayDateValue, redirectTo } from './format.mjs';
import { getPickupMeetupValidationMessage } from './validate.mjs';
import { createElement, setImageSource } from './rendering.mjs';

mountShell({ current: 'home' });

const productId = getRouteId();
const productTitle = document.getElementById('productTitle');
const productImage = document.getElementById('productImage');
const productImageThumbnails = document.getElementById('productImageThumbnails');
const productName = document.getElementById('productName');
const productDescription = document.getElementById('productDescription');
const productCondition = document.getElementById('productCondition');
const productPrice = document.getElementById('productPrice');
const pickupForm = document.getElementById('pickupForm');
const pickupMeetupInput = document.getElementById('pickupMeetupAt');
const pickupWindowHint = document.getElementById('pickupWindowHint');
const dueDateInput = document.getElementById('dueDate');
const continueButton = document.getElementById('continueButton');
const errorElement = document.getElementById('error');
const todayDateValue = getTodayDateValue();
const currentDateTimeValue = getCurrentDateTimeLocalValue();
const DEFAULT_PRODUCT_IMAGE = '/images/campus-placeholder.svg';

let canRequestProduct = false;
let pickupOptions = [];
let galleryImages = [];
let currentGalleryIndex = 0;

dueDateInput.min = todayDateValue;
dueDateInput.value = todayDateValue;
pickupMeetupInput.min = currentDateTimeValue;
pickupMeetupInput.value = currentDateTimeValue;
continueButton.disabled = true;

function setBorrowFlowState({
  canRequest,
  buttonText,
  message = '',
  pickupMessage = '',
  disableDueDate = !canRequest,
  disablePickupMeetup = !canRequest
}) {
  canRequestProduct = canRequest;
  continueButton.disabled = !canRequest;
  continueButton.textContent = buttonText;
  dueDateInput.disabled = disableDueDate;
  pickupMeetupInput.disabled = disablePickupMeetup;
  errorElement.textContent = message;

  if (pickupMessage) {
    pickupForm.replaceChildren(createElement('p', { textContent: pickupMessage }));
    return;
  }

  if (!canRequest) {
    pickupForm.replaceChildren(
      createElement('p', { textContent: 'This borrowing flow is unavailable for this item.' })
    );
  }
}

function updatePickupWindowHint() {
  const selectedOptionValue = pickupForm.querySelector('input[name="pickup"]:checked')?.value;
  const selectedOption = pickupOptions.find(
    (option) => String(option.option_index) === String(selectedOptionValue)
  );

  if (!selectedOption) {
    pickupWindowHint.textContent = canRequestProduct
      ? 'Select a pickup option to see the allowed meetup window.'
      : 'Pickup meetup scheduling is unavailable for this item.';
    return;
  }

  pickupWindowHint.textContent = `Meet at ${selectedOption.location} between ${selectedOption.start_time} and ${selectedOption.end_time}.`;
}

function createPickupOption(option) {
  const wrapper = createElement('label', { className: 'pickup-option' });
  const input = createElement('input', {
    attributes: {
      type: 'radio',
      name: 'pickup',
      value: option.option_index
    }
  });
  const body = createElement('div');

  body.appendChild(createElement('strong', {
    textContent: `Option ${option.option_index}`
  }));
  body.appendChild(createElement('p', { textContent: option.location }));
  body.appendChild(createElement('p', {
    textContent: `${option.start_time} - ${option.end_time}`
  }));
  wrapper.appendChild(input);
  wrapper.appendChild(body);
  return wrapper;
}

function getNormalizedGalleryImages(product) {
  const images = Array.isArray(product.images) && product.images.length
    ? product.images
    : [{ id: `legacy-${product.Product_ID}`, url: product.Product_Url, sortOrder: 0, isCover: true }];

  return images.slice().sort((left, right) => {
    if (Boolean(left.isCover) !== Boolean(right.isCover)) {
      return left.isCover ? -1 : 1;
    }

    return (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0);
  });
}

function renderSelectedGalleryImage(product) {
  setImageSource(
    productImage,
    galleryImages[currentGalleryIndex]?.url,
    product.Product_Name,
    DEFAULT_PRODUCT_IMAGE
  );
}

function renderGallery(product) {
  productImageThumbnails.replaceChildren();
  renderSelectedGalleryImage(product);

  if (galleryImages.length < 2) {
    return;
  }

  galleryImages.forEach((image, index) => {
    const thumbnail = createElement('button', {
      className: `product-thumbnail${index === currentGalleryIndex ? ' is-active' : ''}`,
      attributes: {
        type: 'button',
        'aria-label': `View product image ${index + 1}`
      }
    });
    const thumbnailImage = createElement('img', {
      attributes: {
        alt: `${product.Product_Name || 'Product'} preview ${index + 1}`
      }
    });

    setImageSource(thumbnailImage, image.url, product.Product_Name, DEFAULT_PRODUCT_IMAGE);
    thumbnail.addEventListener('click', () => {
      currentGalleryIndex = index;
      renderGallery(product);
    });
    thumbnail.appendChild(thumbnailImage);
    productImageThumbnails.appendChild(thumbnail);
  });
}

function renderProduct(product) {
  productTitle.textContent = product.Product_Name;
  galleryImages = getNormalizedGalleryImages(product);
  currentGalleryIndex = Math.max(
    galleryImages.findIndex((image) => image.isCover),
    0
  );
  renderGallery(product);
  productName.textContent = product.Product_Name;
  productDescription.textContent = product.Product_Description || 'No description provided.';
  productCondition.textContent = product.Product_Condition || 'N/A';
  productPrice.textContent = formatPrice(product.Product_Lending_Charge);
}

async function loadPickupOptions() {
  pickupOptions = await getJson(`/api/pickup-options/${productId}`);

  if (!pickupOptions.length) {
    setBorrowFlowState({
      canRequest: false,
      buttonText: 'Unavailable',
      message: 'No pickup options are available for this item.',
      pickupMessage: 'No pickup options are available.'
    });
    return;
  }

  pickupForm.replaceChildren();
  pickupOptions.forEach((option) => {
    pickupForm.appendChild(createPickupOption(option));
  });

  setBorrowFlowState({
    canRequest: true,
    buttonText: 'Continue',
    message: '',
    disableDueDate: false,
    disablePickupMeetup: false
  });
  updatePickupWindowHint();
}

async function loadProductPage() {
  let product;

  try {
    product = await getJson(`/api/products/${productId}`);
  } catch (error) {
    productTitle.textContent = 'Product not found';
    setBorrowFlowState({
      canRequest: false,
      buttonText: 'Unavailable',
      message: 'Unable to load this item.',
      pickupMessage: 'Unable to load pickup options.'
    });
    return;
  }

  renderProduct(product);

  if (!product.listing_is_active) {
    setBorrowFlowState({
      canRequest: false,
      buttonText: product.viewer_is_lender ? 'Removed' : 'Unavailable',
      message: product.viewer_is_lender
        ? 'This listing has been removed from your active shelf.'
        : 'This listing is no longer available.',
      pickupMessage: 'This listing has been removed and can no longer accept requests.'
    });
    return;
  }

  if (product.viewer_is_lender) {
    setBorrowFlowState({
      canRequest: false,
      buttonText: 'Your listing',
      message: 'You cannot request your own listing.',
      pickupMessage: 'This is your listing, so pickup selection is disabled.'
    });
    return;
  }

  if (product.Product_Borrower_ID) {
    const isAwaitingPickup = product.current_transaction_status === 'approved';
    setBorrowFlowState({
      canRequest: false,
      buttonText: product.viewer_is_borrower && isAwaitingPickup
        ? 'Reserved for you'
        : 'Unavailable',
      message: product.viewer_is_borrower
        ? (isAwaitingPickup
          ? 'This item is already reserved for you. Open My Transactions to get the pickup code.'
          : 'You already borrowed this item.')
        : (isAwaitingPickup
          ? 'This item is currently reserved for pickup verification.'
          : 'This item is currently unavailable.'),
      pickupMessage: isAwaitingPickup
        ? 'This reservation is waiting for pickup verification and cannot accept another request.'
        : 'This item is not available for a new request right now.'
    });
    return;
  }

  try {
    await loadPickupOptions();
  } catch (error) {
    setBorrowFlowState({
      canRequest: false,
      buttonText: 'Unavailable',
      message: 'Unable to load pickup options.',
      pickupMessage: 'Unable to load pickup options.'
    });
  }
}

continueButton.addEventListener('click', () => {
  errorElement.textContent = '';

  if (!canRequestProduct) {
    errorElement.textContent = 'You cannot request this item.';
    return;
  }

  const selectedOption = pickupForm.querySelector('input[name="pickup"]:checked');
  const pickupMeetupAt = pickupMeetupInput.value;
  const dueDate = dueDateInput.value;

  if (!selectedOption) {
    errorElement.textContent = 'Please select a pickup option.';
    return;
  }

  if (!pickupMeetupAt) {
    errorElement.textContent = 'Please choose a pickup meetup date and time.';
    return;
  }

  if (!dueDate) {
    errorElement.textContent = 'Please choose a due date.';
    return;
  }

  if (dueDate < todayDateValue) {
    errorElement.textContent = 'Due date cannot be in the past.';
    return;
  }

  const selectedPickupOption = pickupOptions.find(
    (option) => String(option.option_index) === String(selectedOption.value)
  );
  const pickupMeetupMessage = getPickupMeetupValidationMessage(
    pickupMeetupAt,
    selectedPickupOption?.start_time,
    selectedPickupOption?.end_time,
    dueDate
  );

  if (pickupMeetupMessage) {
    errorElement.textContent = pickupMeetupMessage;
    return;
  }

  redirectTo(
    `/confirm/${productId}?slot=${selectedOption.value}&dueDate=${encodeURIComponent(dueDate)}&pickupMeetupAt=${encodeURIComponent(pickupMeetupAt)}`
  );
});

pickupForm.addEventListener('change', updatePickupWindowHint);
loadProductPage();
