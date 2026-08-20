import { createListProducts } from '../../application/products/listProducts.mjs';
import type { ProductListQuery, ProductSort } from '../../application/ports/productRepository.mjs';
import type { Product } from '../../domain/products/product.mjs';
import { createLegacyProductRepository } from '../../infrastructure/products/legacyProductRepository.mjs';

const listProducts = createListProducts(createLegacyProductRepository());

const PRODUCT_SORTS: readonly ProductSort[] = ['newest', 'price_asc', 'price_desc'];

interface ProductListRequest {
  query?: Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readSort(value: unknown): ProductSort {
  const candidate = readString(value);
  return PRODUCT_SORTS.includes(candidate as ProductSort) ? (candidate as ProductSort) : 'newest';
}

function readNumber(value: unknown): number | null {
  const candidate = readString(value);

  if (!candidate) {
    return null;
  }

  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

function toQuery(request: ProductListRequest): ProductListQuery {
  const query = request.query || {};
  const limit = readNumber(query.limit);

  return {
    limit: limit === null ? undefined : limit,
    cursor: readString(query.cursor) || null,
    search: readString(query.q) || readString(query.search),
    condition: readString(query.condition),
    maxPrice: readNumber(query.maxPrice),
    sort: readSort(query.sort)
  };
}

function toLegacyProductResponse(product: Product) {
  return {
    Product_ID: product.id,
    Product_Name: product.name,
    Product_Lender_ID: product.lenderId,
    Product_Borrower_ID: product.borrowerId,
    Product_Is_Active: product.isActive ? 1 : 0,
    Product_Description: product.description,
    Product_Condition: product.condition,
    Product_Url: product.imageUrl,
    Product_Lending_Charge: product.lendingCharge,
    image_count: product.imageCount,
    Current_Transaction_Status: product.currentTransactionStatus
  };
}

export async function listProductsHandler(request: ProductListRequest, response: {
  json: (payload: unknown) => void;
}): Promise<void> {
  const page = await listProducts.execute(toQuery(request));

  response.json({
    items: page.items.map(toLegacyProductResponse),
    nextCursor: page.nextCursor
  });
}
