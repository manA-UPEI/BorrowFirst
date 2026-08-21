const { run, get, all } = require('../db/connection');
const { encodeCursor, decodeCursor, normalizeLimit } = require('../db/pagination');
const { resolveProductImageUrl, DEFAULT_PRODUCT_IMAGE } = require('../services/imageService');

const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc'];

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

// Ranks the candidate loans for one product the way getCurrentTransactionStatus
// used to in SQL: an in-progress loan outranks a reservation, then most recently
// advanced, then most recently created.
function compareTransactionRows(left, right) {
  const leftRank = left.status === 'active' ? 0 : 1;
  const rightRank = right.status === 'active' ? 0 : 1;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const leftTime = left.picked_up_at || left.approved_at || left.created_at || '';
  const rightTime = right.picked_up_at || right.approved_at || right.created_at || '';

  if (leftTime !== rightTime) {
    return leftTime < rightTime ? 1 : -1;
  }

  return Number(right.id) - Number(left.id);
}

// Loads every relation a product row needs for display in a fixed number of
// queries, rather than three queries per row. Nothing here depends on the page
// size, so listing 100 products costs the same four round trips as listing one.
async function loadProductRelations(productIds) {
  if (!productIds.length) {
    return {
      coverImages: new Map(),
      imageCounts: new Map(),
      transactionsByProduct: new Map()
    };
  }

  const placeholders = productIds.map(() => '?').join(', ');

  const [coverRows, countRows, transactionRows] = await Promise.all([
    all(
      `SELECT DISTINCT ON (product_id) product_id, image_url
       FROM product_images
       WHERE product_id IN (${placeholders})
       ORDER BY product_id,
                CASE WHEN is_cover THEN 0 ELSE 1 END,
                sort_order ASC,
                id ASC`,
      productIds
    ),
    all(
      `SELECT product_id, COUNT(*)::INTEGER AS image_count
       FROM product_images
       WHERE product_id IN (${placeholders})
       GROUP BY product_id`,
      productIds
    ),
    // Only reservations and in-progress loans can affect the displayed status, so
    // this is a handful of rows even across a full page of products. Ranking them
    // in JavaScript keeps one ORDER BY definition (compareTransactionRows) shared
    // by every caller.
    all(
      `SELECT id, product_id, borrower_id, status, picked_up_at, approved_at, created_at
       FROM notifications
       WHERE product_id IN (${placeholders})
         AND status IN ('approved', 'active')`,
      productIds
    )
  ]);

  const coverImages = new Map(coverRows.map((row) => [Number(row.product_id), row.image_url]));
  const imageCounts = new Map(
    countRows.map((row) => [Number(row.product_id), Number(row.image_count) || 0])
  );

  const transactionsByProduct = new Map();

  for (const row of transactionRows) {
    const productId = Number(row.product_id);
    const existing = transactionsByProduct.get(productId);

    if (existing) {
      existing.push(row);
      continue;
    }

    transactionsByProduct.set(productId, [row]);
  }

  return { coverImages, imageCounts, transactionsByProduct };
}

function hydrateWithRelations(product, relations) {
  const productId = Number(product.Product_ID);
  const coverImage = relations.coverImages.get(productId) || '';
  const candidates = relations.transactionsByProduct?.get(productId) || [];
  // A product with an assigned borrower reports that borrower's loan; otherwise
  // the highest-ranked loan on the product.
  const scoped = product.Product_Borrower_ID
    ? candidates.filter((row) => Number(row.borrower_id) === Number(product.Product_Borrower_ID))
    : candidates;
  const [currentTransaction] = [...scoped].sort(compareTransactionRows);

  return {
    ...product,
    Product_Url: resolveProductImageUrl(coverImage || product.Product_Url || DEFAULT_PRODUCT_IMAGE),
    image_count: relations.imageCounts.get(productId) || 0,
    Current_Transaction_Status: currentTransaction?.status || ''
  };
}

async function hydrateProductRows(products) {
  const relations = await loadProductRelations(products.map((product) => Number(product.Product_ID)));
  return products.map((product) => hydrateWithRelations(product, relations));
}

async function hydrateProductRow(product) {
  if (!product) {
    return product;
  }

  const [hydrated] = await hydrateProductRows([product]);
  return hydrated;
}

function buildListFilters({ search, condition, maxPrice }) {
  const clauses = ['"Product_Is_Active" = 1'];
  const params = [];

  if (search) {
    clauses.push('("Product_Name" ILIKE ? OR COALESCE("Product_Description", \'\') ILIKE ? OR COALESCE("Product_Condition", \'\') ILIKE ?)');
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern);
  }

  if (condition) {
    clauses.push('"Product_Condition" = ?');
    params.push(condition);
  }

  if (maxPrice !== null) {
    clauses.push('"Product_Lending_Charge" <= ?');
    params.push(maxPrice);
  }

  return { clauses, params };
}

// Every sort ends in "Product_ID" DESC so the ordering is total: without a unique
// tiebreaker, rows sharing a price have no stable position and a cursor cannot
// name an unambiguous resume point.
function buildListKeyset(sort, cursorValues) {
  if (sort === 'price_asc') {
    return {
      orderBy: 'ORDER BY "Product_Lending_Charge" ASC, "Product_ID" DESC',
      clause: cursorValues
        ? '("Product_Lending_Charge" > ? OR ("Product_Lending_Charge" = ? AND "Product_ID" < ?))'
        : '',
      params: cursorValues ? [cursorValues[0], cursorValues[0], cursorValues[1]] : [],
      cursorLength: 2,
      toCursor: (row) => encodeCursor([row.Product_Lending_Charge, row.Product_ID])
    };
  }

  if (sort === 'price_desc') {
    return {
      orderBy: 'ORDER BY "Product_Lending_Charge" DESC, "Product_ID" DESC',
      clause: cursorValues
        ? '("Product_Lending_Charge" < ? OR ("Product_Lending_Charge" = ? AND "Product_ID" < ?))'
        : '',
      params: cursorValues ? [cursorValues[0], cursorValues[0], cursorValues[1]] : [],
      cursorLength: 2,
      toCursor: (row) => encodeCursor([row.Product_Lending_Charge, row.Product_ID])
    };
  }

  return {
    orderBy: 'ORDER BY "Product_ID" DESC',
    clause: cursorValues ? '"Product_ID" < ?' : '',
    params: cursorValues ? [cursorValues[0]] : [],
    cursorLength: 1,
    toCursor: (row) => encodeCursor([row.Product_ID])
  };
}

async function listProducts({
  limit,
  cursor = null,
  search = '',
  condition = '',
  maxPrice = null,
  sort = 'newest'
} = {}) {
  const pageSize = normalizeLimit(limit);
  const resolvedSort = PRODUCT_SORTS.includes(sort) ? sort : 'newest';
  const cursorLength = resolvedSort === 'newest' ? 1 : 2;
  const keyset = buildListKeyset(resolvedSort, decodeCursor(cursor, cursorLength));
  const filters = buildListFilters({
    search: typeof search === 'string' ? search.trim() : '',
    condition: typeof condition === 'string' ? condition.trim() : '',
    maxPrice: Number.isFinite(Number(maxPrice)) && maxPrice !== null ? Number(maxPrice) : null
  });

  if (keyset.clause) {
    filters.clauses.push(keyset.clause);
    filters.params.push(...keyset.params);
  }

  // One row beyond the page tells us whether a next page exists without a
  // separate COUNT over the whole filtered set.
  const rows = await all(
    `SELECT ${PRODUCT_SELECT_FIELDS_SQL}
     FROM products
     WHERE ${filters.clauses.join(' AND ')}
     ${keyset.orderBy}
     LIMIT ?`,
    [...filters.params, pageSize + 1]
  );

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

  return {
    items: await hydrateProductRows(pageRows),
    nextCursor: hasMore ? keyset.toCursor(pageRows[pageRows.length - 1]) : null
  };
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

// Seeds the campus defaults only for a listing that declares no pickup windows
// at all. This used to backfill each missing index 1..3 independently, which
// meant a lender who defined a single window silently got two campus locations
// bolted onto their listing.
async function ensurePickupOptions(productId) {
  const existingOptions = await all(
    'SELECT option_index FROM pickup_options WHERE product_id = ?',
    [productId]
  );

  if (existingOptions.length > 0) {
    return;
  }

  for (let index = 0; index < DEFAULT_PICKUP_OPTIONS.length; index += 1) {
    const option = DEFAULT_PICKUP_OPTIONS[index];
    await run(
      'INSERT INTO pickup_options (product_id, option_index, location, start_time, end_time) VALUES (?, ?, ?, ?, ?)',
      [productId, index + 1, option[0], option[1], option[2]]
    );
  }
}

// Replaces the lender's pickup windows wholesale. Option indexes are 1-based
// because notifications.pickup_option has always referred to them that way.
async function replacePickupOptions(productId, windows) {
  await run('DELETE FROM pickup_options WHERE product_id = ?', [productId]);

  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index];
    await run(
      'INSERT INTO pickup_options (product_id, option_index, location, start_time, end_time) VALUES (?, ?, ?, ?, ?)',
      [productId, index + 1, window.location, window.startTime, window.endTime]
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
  PRODUCT_SORTS,
  listProducts,
  createProduct,
  findById,
  addProductImage,
  listProductImages,
  updateCoverImage,
  clearProductImages,
  ensurePickupOptions,
  replacePickupOptions,
  listPickupOptions,
  assignBorrower,
  releaseBorrower,
  releaseBorrowerIfMatch,
  deactivateProduct
};
