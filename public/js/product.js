import { mountShell } from './layout.mjs';
import { getJson } from './api.js';
import { formatPrice, getCurrentDateTimeLocalValue, getRouteId, getTodayDateValue, redirectTo } from './format.mjs';
import { getBookingRangeValidationMessage, getPickupMeetupValidationMessage } from './validate.mjs';
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
const startDateInput = document.getElementById('startDate');
const dueDateInput = document.getElementById('dueDate');
const availabilityNotice = document.getElementById('availabilityNotice');
const continueButton = document.getElementById('continueButton');
const errorElement = document.getElementById('error');
const todayDateValue = getTodayDateValue();
const currentDateTimeValue = getCurrentDateTimeLocalValue();
const DEFAULT_PRODUCT_IMAGE = '/images/campus-placeholder.svg';

let canRequestProduct = false;
let pickupOptions = [];
let availability = { windows: [], unavailableRanges: [], maxLoanDays: 0 };
let galleryImages = [];
let currentGalleryIndex = 0;

startDateInput.min = todayDateValue;
startDateInput.value = todayDateValue;
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
  startDateInput.disabled = disableDueDate;
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

function renderAvailabilityNotice() {
  const offered = availability.windows.filter((window) => window.kind === 'available');
  const parts = [];

  if (offered.length) {
    parts.push(`Offered ${offered.map((w) => `${w.startDate} to ${w.endDate}`).join(', ')}.`);
    // Constrain the pickers to the outer bounds of what the lender offers; the
    // gaps inside are still caught by validation and listed below.
    startDateInput.min = offered[0].startDate > todayDateValue ? offered[0].startDate : todayDateValue;
    startDateInput.max = offered[offered.length - 1].endDate;
    dueDateInput.max = offered[offered.length - 1].endDate;
  } else {
    parts.push('Available any time.');
  }

  if (availability.unavailableRanges.length) {
    parts.push(
      `Already taken: ${availability.unavailableRanges.map((r) => `${r.startDate} to ${r.endDate}`).join(', ')}.`
    );
  }

  if (availability.maxLoanDays) {
    parts.push(`Up to ${availability.maxLoanDays} days per loan.`);
  }

  availabilityNotice.textContent = parts.join(' ');
}

async function loadAvailability() {
  try {
    availability = await getJson(`/api/products/${productId}/availability`);
  } catch (error) {
    // A listing with no availability data is still bookable; the server is
    // authoritative either way, so this only costs the borrower the preview.
    availability = { windows: [], unavailableRanges: [], maxLoanDays: 0 };
  }

  renderAvailabilityNotice();
}

// The pickup handover must land on the first booked day, so the date half of the
// meetup follows the start date and only the time is the borrower's to choose.
function syncPickupMeetupToStartDate() {
  const startDate = startDateInput.value;

  if (!startDate) {
    return;
  }

  if (dueDateInput.value && dueDateInput.value < startDate) {
    dueDateInput.value = startDate;
  }

  dueDateInput.min = startDate;

  const currentTime = pickupMeetupInput.value.slice(11, 16) || '10:00';
  pickupMeetupInput.value = `${startDate}T${currentTime}`;
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
    await Promise.all([loadPickupOptions(), loadAvailability()]);
    syncPickupMeetupToStartDate();
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
  const startDate = startDateInput.value;
  const dueDate = dueDateInput.value;

  if (!selectedOption) {
    errorElement.textContent = 'Please select a pickup option.';
    return;
  }

  if (!pickupMeetupAt) {
    errorElement.textContent = 'Please choose a pickup meetup date and time.';
    return;
  }

  if (!startDate) {
    errorElement.textContent = 'Please choose a start date.';
    return;
  }

  if (!dueDate) {
    errorElement.textContent = 'Please choose a return date.';
    return;
  }

  const bookingMessage = getBookingRangeValidationMessage(startDate, dueDate, {
    windows: availability.windows,
    unavailableRanges: availability.unavailableRanges,
    maxLoanDays: availability.maxLoanDays,
    today: todayDateValue
  });

  if (bookingMessage) {
    errorElement.textContent = bookingMessage;
    return;
  }

  const selectedPickupOption = pickupOptions.find(
    (option) => String(option.option_index) === String(selectedOption.value)
  );
  const pickupMeetupMessage = getPickupMeetupValidationMessage(
    pickupMeetupAt,
    selectedPickupOption?.start_time,
    selectedPickupOption?.end_time,
    dueDate,
    startDate
  );

  if (pickupMeetupMessage) {
    errorElement.textContent = pickupMeetupMessage;
    return;
  }

  redirectTo(
    `/confirm/${productId}?slot=${selectedOption.value}`
    + `&startDate=${encodeURIComponent(startDate)}`
    + `&dueDate=${encodeURIComponent(dueDate)}`
    + `&pickupMeetupAt=${encodeURIComponent(pickupMeetupAt)}`
  );
});

pickupForm.addEventListener('change', updatePickupWindowHint);
startDateInput.addEventListener('change', syncPickupMeetupToStartDate);
loadProductPage();
