const DEFAULT_PRODUCT_IMAGE = '/images/campus-placeholder.svg';
const MAX_LEGACY_DATA_IMAGE_BYTES = 1024 * 1024;
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PRODUCT_IMAGE_COUNT = 5;
const ALLOWED_PRODUCT_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);

function getDecodedDataUrlByteLength(payload, isBase64) {
  if (typeof payload !== 'string') {
    return 0;
  }

  try {
    if (isBase64) {
      return Buffer.from(payload, 'base64').length;
    }

    return Buffer.byteLength(decodeURIComponent(payload), 'utf8');
  } catch (error) {
    return Number.POSITIVE_INFINITY;
  }
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

function normalizeProductImageUrl(value) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';

  if (!normalizedValue) {
    return '';
  }

  if (isSafeStaticImagePath(normalizedValue) || isSafeCloudinaryImageUrl(normalizedValue)) {
    return normalizedValue;
  }

  const dataUrlMatch = normalizedValue.match(/^data:([^;,]+)(;base64)?,(.*)$/i);

  if (!dataUrlMatch) {
    return '';
  }

  const mimeType = dataUrlMatch[1].toLowerCase();
  const isBase64 = dataUrlMatch[2] === ';base64';
  const payload = dataUrlMatch[3];

  if (!ALLOWED_PRODUCT_IMAGE_MIME_TYPES.has(mimeType)) {
    return '';
  }

  if (getDecodedDataUrlByteLength(payload, isBase64) > MAX_LEGACY_DATA_IMAGE_BYTES) {
    return '';
  }

  return normalizedValue;
}

function resolveProductImageUrl(value) {
  return normalizeProductImageUrl(value) || DEFAULT_PRODUCT_IMAGE;
}

module.exports = {
  DEFAULT_PRODUCT_IMAGE,
  MAX_LEGACY_DATA_IMAGE_BYTES,
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_IMAGE_COUNT,
  ALLOWED_PRODUCT_IMAGE_MIME_TYPES,
  isSafeStaticImagePath,
  isSafeCloudinaryImageUrl,
  normalizeProductImageUrl,
  resolveProductImageUrl
};
