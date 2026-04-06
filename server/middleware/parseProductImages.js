const multer = require('multer');

const {
  ALLOWED_PRODUCT_IMAGE_MIME_TYPES,
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_IMAGE_COUNT
} = require('../services/imageService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PRODUCT_IMAGE_BYTES,
    files: MAX_PRODUCT_IMAGE_COUNT
  },
  fileFilter(req, file, callback) {
    if (!ALLOWED_PRODUCT_IMAGE_MIME_TYPES.has(file.mimetype)) {
      callback(new Error('Only PNG, JPEG, WebP, and GIF images up to 5 MiB are allowed.'));
      return;
    }

    callback(null, true);
  }
});

function getUploadErrorMessage(error) {
  if (!error) {
    return '';
  }

  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return 'Each image must be 5 MiB or smaller.';
      case 'LIMIT_FILE_COUNT':
      case 'LIMIT_UNEXPECTED_FILE':
        return `You can upload up to ${MAX_PRODUCT_IMAGE_COUNT} photos per listing.`;
      default:
        return 'Unable to process the uploaded images.';
    }
  }

  return error.message || 'Unable to process the uploaded images.';
}

function parseProductImages(req, res, next) {
  upload.array('images', MAX_PRODUCT_IMAGE_COUNT)(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    res.status(400).json({ message: getUploadErrorMessage(error) });
  });
}

module.exports = parseProductImages;
