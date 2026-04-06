const notificationModel = require('../models/notificationModel');
const productModel = require('../models/productModel');
const { withTransaction } = require('../db/connection');
const { DEFAULT_PRODUCT_IMAGE, resolveProductImageUrl } = require('../services/imageService');
const { deleteProductImage, uploadProductImage } = require('../services/productImageStorage');
const { expireStaleApprovals } = require('../services/transactionLifecycleService');
const {
  getValidatedProductFields,
  getValidatedProductCoverIndex
} = require('../services/validationService');

async function list(req, res) {
  await expireStaleApprovals();
  const products = await productModel.listProducts();
  res.json(products);
}

async function create(req, res) {
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];
  const productFields = getValidatedProductFields({
    name: req.body.name,
    description: req.body.description,
    condition: req.body.condition,
    price: req.body.price,
    imageUrl: req.body.imageUrl
  });

  if (productFields.message) {
    res.status(400).json({ message: productFields.message });
    return;
  }

  const coverIndexResult = getValidatedProductCoverIndex(req.body.coverIndex, uploadedFiles.length);

  if (coverIndexResult.message) {
    res.status(400).json({ message: coverIndexResult.message });
    return;
  }

  const uploadedAssets = [];

  try {
    const productId = await withTransaction(async () => {
      const nextProductId = await productModel.createProduct({
        name: productFields.name,
        lenderId: req.session.userId,
        description: productFields.description,
        condition: productFields.condition,
        price: productFields.price,
        imageUrl: uploadedFiles.length ? DEFAULT_PRODUCT_IMAGE : productFields.imageUrl
      });

      if (!uploadedFiles.length) {
        return nextProductId;
      }

      for (let index = 0; index < uploadedFiles.length; index += 1) {
        const file = uploadedFiles[index];
        const imageAsset = await uploadProductImage(file.buffer, {
          mimeType: file.mimetype,
          originalName: file.originalname,
          productId: nextProductId,
          lenderId: req.session.userId,
          sortOrder: index
        });

        uploadedAssets.push(imageAsset);

        await productModel.addProductImage({
          productId: nextProductId,
          cloudinaryPublicId: imageAsset.publicId,
          imageUrl: imageAsset.url,
          sortOrder: index,
          isCover: index === coverIndexResult.coverIndex,
          width: imageAsset.width,
          height: imageAsset.height,
          bytes: imageAsset.bytes,
          mimeType: imageAsset.mimeType
        });
      }

      const coverImage = uploadedAssets[coverIndexResult.coverIndex] || uploadedAssets[0];

      if (coverImage?.url) {
        await productModel.updateCoverImage(nextProductId, coverImage.url);
      }

      return nextProductId;
    });

    res.json({ success: true, id: productId });
  } catch (error) {
    await Promise.all(
      uploadedAssets.map((imageAsset) => (
        imageAsset?.publicId
          ? deleteProductImage(imageAsset.publicId).catch((cleanupError) => {
            console.error('Failed to clean up Cloudinary image after create error.', cleanupError);
          })
          : Promise.resolve()
      ))
    );

    res.status(error.statusCode || 500).json({
      message: error.message || 'Unable to add item.'
    });
  }
}

async function details(req, res) {
  await expireStaleApprovals();
  const product = await productModel.findById(Number(req.params.id));

  if (!product) {
    res.status(404).json({ message: 'Product not found' });
    return;
  }

  const viewerId = Number(req.session.userId);
  const lenderId = Number(product.Product_Lender_ID);
  const borrowerId = Number(product.Product_Borrower_ID);
  const isActive = Number(product.Product_Is_Active) === 1;
  const viewerIsLender = lenderId === viewerId;
  const viewerIsBorrower = borrowerId === viewerId;

  res.json({
    ...product,
    images: await getProductImagesPayload(product.Product_ID, product.Product_Name, product.Product_Url),
    current_transaction_status: product.Current_Transaction_Status || '',
    listing_is_active: isActive,
    viewer_is_lender: viewerIsLender,
    viewer_is_borrower: viewerIsBorrower,
    viewer_can_request: isActive && !viewerIsLender && !borrowerId
  });
}

async function remove(req, res) {
  await expireStaleApprovals();
  const productId = Number(req.params.id);

  if (!Number.isInteger(productId) || productId <= 0) {
    res.status(400).json({ message: 'Invalid product' });
    return;
  }

  const product = await productModel.findById(productId);

  if (!product) {
    res.status(404).json({ message: 'Product not found' });
    return;
  }

  if (Number(product.Product_Lender_ID) !== Number(req.session.userId)) {
    res.status(403).json({ message: 'Not allowed' });
    return;
  }

  if (Number(product.Product_Is_Active) !== 1) {
    res.json({ success: true, alreadyRemoved: true });
    return;
  }

  if (product.Product_Borrower_ID) {
    res.status(400).json({ message: 'Items currently on loan cannot be removed from listings.' });
    return;
  }

  await productModel.deactivateProduct(productId);
  await notificationModel.rejectPendingForProduct(productId);

  const productImages = await productModel.listProductImages(productId);
  const deletedResults = await Promise.all(
    productImages.map((image) => (
      image.cloudinary_public_id
        ? deleteProductImage(image.cloudinary_public_id).catch((error) => {
          console.error('Failed to delete Cloudinary image during listing removal.', error);
          return false;
        })
        : Promise.resolve(true)
    ))
  );

  if (productImages.length && deletedResults.every(Boolean)) {
    await productModel.clearProductImages(productId);
  }

  res.json({ success: true, removed: true });
}

async function getProductImagesPayload(productId, productName, fallbackUrl) {
  const productImages = await productModel.listProductImages(productId);

  if (productImages.length) {
    return productImages.map((image) => ({
      id: image.id,
      url: resolveProductImageUrl(image.image_url),
      sortOrder: Number(image.sort_order) || 0,
      isCover: Boolean(image.is_cover)
    }));
  }

  return [{
    id: `legacy-${productId}`,
    url: resolveProductImageUrl(fallbackUrl),
    sortOrder: 0,
    isCover: true,
    alt: productName || 'Product image'
  }];
}

async function pickupOptions(req, res) {
  await expireStaleApprovals();
  const productId = Number(req.params.productId);

  if (!Number.isInteger(productId) || productId <= 0) {
    res.status(400).json({ message: 'Invalid product' });
    return;
  }

  const product = await productModel.findById(productId);

  if (!product) {
    res.status(404).json({ message: 'Product not found' });
    return;
  }

  if (Number(product.Product_Is_Active) !== 1) {
    res.status(400).json({ message: 'Listing is no longer available' });
    return;
  }

  await productModel.ensurePickupOptions(productId);
  const options = await productModel.listPickupOptions(productId);
  res.json(options);
}

module.exports = {
  list,
  create,
  details,
  pickupOptions,
  remove
};
