export const MAX_PRODUCT_IMAGE_COUNT = 5;
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_PRODUCT_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);

export function validateSelectedProductImages(filesLike) {
  const files = Array.from(filesLike || []).filter(Boolean);

  if (files.length > MAX_PRODUCT_IMAGE_COUNT) {
    return {
      message: `You can upload up to ${MAX_PRODUCT_IMAGE_COUNT} photos per listing.`,
      files: []
    };
  }

  for (const file of files) {
    if (!ALLOWED_PRODUCT_IMAGE_TYPES.has(file.type)) {
      return {
        message: 'Only PNG, JPEG, WebP, and GIF images are allowed.',
        files: []
      };
    }

    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      return {
        message: 'Each image must be 5 MiB or smaller.',
        files: []
      };
    }
  }

  return {
    message: '',
    files
  };
}

export function createProductListingFormData(fields, imageFiles, coverIndex = 0) {
  const formData = new FormData();

  Object.entries(fields || {}).forEach(([key, value]) => {
    formData.append(key, value == null ? '' : String(value));
  });

  (imageFiles || []).forEach((file) => {
    formData.append('images', file);
  });

  if ((imageFiles || []).length) {
    formData.append('coverIndex', String(coverIndex));
  }

  return formData;
}

export function createProductImagePreviewCard({
  fileName,
  previewUrl,
  index,
  isCover = false,
  onSelect = null
}) {
  const previewCard = document.createElement('label');
  const image = document.createElement('img');
  const coverChoice = document.createElement('input');
  const caption = document.createElement('div');
  const title = document.createElement('strong');
  const subtitle = document.createElement('span');

  previewCard.className = `product-image-preview-card${isCover ? ' is-cover' : ''}`;
  image.src = previewUrl;
  image.alt = `Selected preview ${index + 1}`;

  coverChoice.type = 'radio';
  coverChoice.name = 'productCoverImage';
  coverChoice.value = String(index);
  coverChoice.checked = isCover;

  if (typeof onSelect === 'function') {
    coverChoice.addEventListener('change', () => onSelect(index));
  }

  caption.className = 'product-image-preview-meta';
  title.textContent = fileName;
  subtitle.textContent = isCover ? 'Cover photo' : 'Set as cover';

  caption.appendChild(title);
  caption.appendChild(subtitle);
  previewCard.appendChild(image);
  previewCard.appendChild(coverChoice);
  previewCard.appendChild(caption);

  return previewCard;
}
