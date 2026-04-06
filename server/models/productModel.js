const { run, get, all } = require('../db/connection');
const { resolveProductImageUrl, DEFAULT_PRODUCT_IMAGE } = require('../services/imageService');

const DEFAULT_PICKUP_OPTIONS = [
  ['Main Library Lobby', '09:00 AM', '11:00 AM'],
  ['Student Union Entrance', '12:00 PM', '02:00 PM'],
  ['Downtown Campus Desk', '03:00 PM', '05:00 PM']
];

const PRODUCT_SELECT_FIELDS_SQL = `
  products."Product_ID",
  products."Product_Name",
  products."Product_Lender_ID",
  products."Product_Borrower_ID",
  products."Product_Is_Active",
  products."Product_Description",
  products."Product_Condition",
  products."Product_Url",
  products."Product_Lending_Charge",
  0::INTEGER AS image_count
`;

async function hydrateProductRow(product) {
  if (!product) {
    return product;
  }

  const [coverImage, imageCount, currentTransactionStatus] = await Promise.all([
    getCoverImageUrl(product.Product_ID),
    countProductImages(product.Product_ID),
    getCurrentTransactionStatus(product.Product_ID, product.Product_Borrower_ID)
  ]);

  return {
    ...product,
    Product_Url: resolveProductImageUrl(coverImage || product.Product_Url || DEFAULT_PRODUCT_IMAGE),
    image_count: imageCount,
    Current_Transaction_Status: currentTransactionStatus
  };
}

async function listProducts() {
  const products = await all(
    `SELECT ${PRODUCT_SELECT_FIELDS_SQL}
     FROM products
     WHERE "Product_Is_Active" = 1
     ORDER BY "Product_ID" DESC`
  );

  return Promise.all(products.map((product) => hydrateProductRow(product)));
}

async function createProduct({ name, lenderId, description, condition, price, imageUrl }) {
  const result = await run(
    `INSERT INTO products (
      "Product_Name",
      "Product_Lender_ID",
      "Product_Borrower_ID",
      "Product_Is_Active",
      "Product_Description",
      "Product_Condition",
      "Product_Url",
      "Product_Lending_Charge"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING "Product_ID" AS "lastID"`,
    [
      name,
      lenderId,
      null,
      1,
      description || '',
      condition || 'Good',
      resolveProductImageUrl(imageUrl),
      price
    ]
  );

  return result.lastID;
}

async function findById(productId) {
  const product = await get(
    `SELECT ${PRODUCT_SELECT_FIELDS_SQL}
     FROM products
     WHERE "Product_ID" = ?`,
    [productId]
  );

  return hydrateProductRow(product);
}

async function addProductImage({
  productId,
  cloudinaryPublicId,
  imageUrl,
  sortOrder,
  isCover,
  width,
  height,
  bytes,
  mimeType
}) {
  const result = await run(
    `INSERT INTO product_images (
      product_id,
      cloudinary_public_id,
      image_url,
      sort_order,
      is_cover,
      width,
      height,
      bytes,
      mime_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id AS "lastID"`,
    [
      productId,
      cloudinaryPublicId || '',
      resolveProductImageUrl(imageUrl),
      sortOrder,
      Boolean(isCover),
      width,
      height,
      bytes,
      mimeType || ''
    ]
  );

  return result.lastID;
}

function listProductImages(productId) {
  return all(
    `SELECT id,
            product_id,
            cloudinary_public_id,
            image_url,
            sort_order,
            is_cover,
            width,
            height,
            bytes,
            mime_type,
            created_at
     FROM product_images
     WHERE product_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [productId]
  );
}

async function getCoverImageUrl(productId) {
  const coverImage = await get(
    `SELECT image_url
     FROM product_images
     WHERE product_id = ?
     ORDER BY CASE WHEN is_cover THEN 0 ELSE 1 END,
              sort_order ASC,
              id ASC
     LIMIT 1`,
    [productId]
  );

  return coverImage?.image_url || '';
}

async function countProductImages(productId) {
  const row = await get(
    'SELECT COUNT(*)::INTEGER AS image_count FROM product_images WHERE product_id = ?',
    [productId]
  );

  return Number(row?.image_count) || 0;
}

async function getCurrentTransactionStatus(productId, borrowerId) {
  let row;

  if (borrowerId) {
    row = await get(
      `SELECT status
       FROM notifications
       WHERE product_id = ?
         AND status IN ('approved', 'active')
         AND borrower_id = ?
       ORDER BY CASE status
                  WHEN 'active' THEN 0
                  ELSE 1
                END,
                COALESCE(picked_up_at, approved_at, created_at) DESC,
                id DESC
       LIMIT 1`,
      [productId, borrowerId]
    );
  } else {
    row = await get(
      `SELECT status
       FROM notifications
       WHERE product_id = ?
         AND status IN ('approved', 'active')
       ORDER BY CASE status
                  WHEN 'active' THEN 0
                  ELSE 1
                END,
                COALESCE(picked_up_at, approved_at, created_at) DESC,
                id DESC
       LIMIT 1`,
      [productId]
    );
  }

  return row?.status || '';
}

async function updateCoverImage(productId, imageUrl) {
  await run(
    'UPDATE products SET "Product_Url" = ? WHERE "Product_ID" = ?',
    [resolveProductImageUrl(imageUrl), productId]
  );
}

async function clearProductImages(productId) {
  await run('DELETE FROM product_images WHERE product_id = ?', [productId]);
  await updateCoverImage(productId, DEFAULT_PRODUCT_IMAGE);
}

async function ensurePickupOptions(productId) {
  const existingOptions = await all(
    'SELECT option_index FROM pickup_options WHERE product_id = ?',
    [productId]
  );

  const existingIndexes = new Set(existingOptions.map((option) => option.option_index));

  for (let index = 0; index < DEFAULT_PICKUP_OPTIONS.length; index += 1) {
    if (existingIndexes.has(index + 1)) {
      continue;
    }

    const option = DEFAULT_PICKUP_OPTIONS[index];
    await run(
      'INSERT INTO pickup_options (product_id, option_index, location, start_time, end_time) VALUES (?, ?, ?, ?, ?)',
      [productId, index + 1, option[0], option[1], option[2]]
    );
  }
}

function listPickupOptions(productId) {
  return all(
    'SELECT * FROM pickup_options WHERE product_id = ? ORDER BY option_index',
    [productId]
  );
}

async function assignBorrower(productId, borrowerId) {
  await run(
    'UPDATE products SET "Product_Borrower_ID" = ? WHERE "Product_ID" = ?',
    [borrowerId, productId]
  );
}

async function releaseBorrower(productId) {
  await run(
    'UPDATE products SET "Product_Borrower_ID" = NULL WHERE "Product_ID" = ?',
    [productId]
  );
}

async function releaseBorrowerIfMatch(productId, borrowerId) {
  await run(
    'UPDATE products SET "Product_Borrower_ID" = NULL WHERE "Product_ID" = ? AND "Product_Borrower_ID" = ?',
    [productId, borrowerId]
  );
}

async function deactivateProduct(productId) {
  await run(
    'UPDATE products SET "Product_Is_Active" = 0 WHERE "Product_ID" = ?',
    [productId]
  );
}

module.exports = {
  listProducts,
  createProduct,
  findById,
  addProductImage,
  listProductImages,
  updateCoverImage,
  clearProductImages,
  ensurePickupOptions,
  listPickupOptions,
  assignBorrower,
  releaseBorrower,
  releaseBorrowerIfMatch,
  deactivateProduct
};
