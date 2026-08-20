import { createRequire } from 'node:module';
import type { Product } from '../../domain/products/product.mjs';
import type {
  ProductListQuery,
  ProductPage,
  ProductRepository
} from '../../application/ports/productRepository.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const legacyProductModel = loadLegacyModule('../../../../server/models/productModel') as {
  listProducts: (query?: ProductListQuery) => Promise<{
    items: readonly Record<string, unknown>[];
    nextCursor: string | null;
  }>;
};

function toProduct(row: Record<string, unknown>): Product {
  return {
    id: Number(row.Product_ID),
    name: String(row.Product_Name || ''),
    lenderId: Number(row.Product_Lender_ID),
    borrowerId: row.Product_Borrower_ID == null ? null : Number(row.Product_Borrower_ID),
    isActive: Number(row.Product_Is_Active) === 1,
    description: String(row.Product_Description || ''),
    condition: String(row.Product_Condition || 'Good'),
    imageUrl: String(row.Product_Url || ''),
    lendingCharge: Number(row.Product_Lending_Charge) || 0,
    imageCount: Number(row.image_count) || 0,
    currentTransactionStatus: String(row.Current_Transaction_Status || '')
  };
}

export function createLegacyProductRepository(): ProductRepository {
  return {
    async listActive(query?: ProductListQuery): Promise<ProductPage> {
      const page = await legacyProductModel.listProducts(query);

      return {
        items: page.items.map(toProduct),
        nextCursor: page.nextCursor
      };
    }
  };
}
