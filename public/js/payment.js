import { getJson } from './api.js';
import { formatPrice, getQueryParam, logout, redirectTo } from './helpers.js';
import { renderSummary } from './rendering.mjs';

const productId = getQueryParam('productId');
const slot = getQueryParam('slot');
const paymentSummary = document.getElementById('paymentSummary');
const backHomeButton = document.getElementById('backHome');
const logoutButton = document.getElementById('logoutButton');

async function loadPaymentSummary() {
  try {
    const [product, options] = await Promise.all([
      getJson(`/api/products/${productId}`),
      getJson(`/api/pickup-options/${productId}`)
    ]);

    const selectedOption = options.find((option) => String(option.option_index) === String(slot));

    renderSummary(paymentSummary, [
      { label: 'Product', value: product.Product_Name },
      { label: 'Pickup', value: selectedOption ? selectedOption.location : 'Unknown option' },
      {
        label: 'Time Window',
        value: selectedOption ? `${selectedOption.start_time} - ${selectedOption.end_time}` : 'N/A'
      },
      { label: 'Amount', value: formatPrice(product.Product_Lending_Charge) }
    ]);
  } catch (error) {
    paymentSummary.textContent = 'Unable to load payment details.';
  }
}

backHomeButton.addEventListener('click', () => {
  redirectTo('/home');
});

logoutButton.addEventListener('click', logout);

loadPaymentSummary();
