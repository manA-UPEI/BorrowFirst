const crypto = require('node:crypto');
const { Blob } = require('node:buffer');

const CLOUDINARY_API_BASE = 'https://api.cloudinary.com/v1_1';
const DEFAULT_PRODUCT_IMAGE_FOLDER = 'borrowfirst/products';

function getCloudinaryConfig() {
  const cloudName = typeof process.env.CLOUDINARY_CLOUD_NAME === 'string'
    ? process.env.CLOUDINARY_CLOUD_NAME.trim()
    : '';
  const apiKey = typeof process.env.CLOUDINARY_API_KEY === 'string'
    ? process.env.CLOUDINARY_API_KEY.trim()
    : '';
  const apiSecret = typeof process.env.CLOUDINARY_API_SECRET === 'string'
    ? process.env.CLOUDINARY_API_SECRET.trim()
    : '';

  return {
    cloudName,
    apiKey,
    apiSecret,
    isConfigured: Boolean(cloudName && apiKey && apiSecret)
  };
}

function createStorageError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildSignature(params, apiSecret) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto
    .createHash('sha1')
    .update(`${payload}${apiSecret}`)
    .digest('hex');
}

function sanitizePublicIdPart(value) {
  return String(value || 'image')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'image';
}

function getFormData() {
  if (typeof FormData !== 'function') {
    throw createStorageError('Image uploads are not supported in this runtime.');
  }

  return new FormData();
}

async function parseCloudinaryResponse(response) {
  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const message = payload && typeof payload.error?.message === 'string'
      ? payload.error.message
      : 'Image upload failed.';
    throw createStorageError(message, response.status || 502);
  }

  return payload || {};
}

function assertStorageConfigured() {
  const config = getCloudinaryConfig();

  if (!config.isConfigured) {
    throw createStorageError('Image uploads are not configured.', 503);
  }

  return config;
}

async function uploadProductImage(buffer, {
  mimeType,
  originalName,
  productId,
  lenderId,
  sortOrder
} = {}) {
  const { cloudName, apiKey, apiSecret } = assertStorageConfigured();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = DEFAULT_PRODUCT_IMAGE_FOLDER;
  const publicId = [
    `product-${Number(productId) || 'draft'}`,
    `user-${Number(lenderId) || 'unknown'}`,
    `slot-${Number(sortOrder) + 1 || 1}`,
    sanitizePublicIdPart(originalName)
  ].join('-');
  const signature = buildSignature({ folder, public_id: publicId, timestamp }, apiSecret);
  const formData = getFormData();

  formData.set('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), originalName || 'image');
  formData.set('api_key', apiKey);
  formData.set('timestamp', String(timestamp));
  formData.set('folder', folder);
  formData.set('public_id', publicId);
  formData.set('signature', signature);

  const response = await fetch(`${CLOUDINARY_API_BASE}/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData
  });
  const payload = await parseCloudinaryResponse(response);

  return {
    publicId: payload.public_id,
    url: payload.secure_url || payload.url || '',
    width: Number.isFinite(Number(payload.width)) ? Number(payload.width) : null,
    height: Number.isFinite(Number(payload.height)) ? Number(payload.height) : null,
    bytes: Number.isFinite(Number(payload.bytes)) ? Number(payload.bytes) : buffer.length,
    mimeType: mimeType || ''
  };
}

async function deleteProductImage(publicId) {
  if (!publicId) {
    return false;
  }

  const { cloudName, apiKey, apiSecret, isConfigured } = getCloudinaryConfig();

  if (!isConfigured) {
    return false;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildSignature({ public_id: publicId, timestamp }, apiSecret);
  const body = new URLSearchParams({
    api_key: apiKey,
    public_id: publicId,
    signature,
    timestamp: String(timestamp)
  });
  const response = await fetch(`${CLOUDINARY_API_BASE}/${cloudName}/image/destroy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });
  const payload = await parseCloudinaryResponse(response);
  return payload.result === 'ok' || payload.result === 'not found';
}

module.exports = {
  getCloudinaryConfig,
  uploadProductImage,
  deleteProductImage
};
