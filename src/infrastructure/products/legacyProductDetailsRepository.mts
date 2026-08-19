import { createRequire } from 'node:module';
import type { ProductDetailsRepository } from '../../application/ports/productDetailsRepository.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const productModel = loadLegacyModule('../../../../server/models/productModel') as Record<string, any>;

export function createLegacyProductDetailsRepository(): ProductDetailsRepository {
  return {
    async findById(productId) {
      const row = await productModel.findById(productId);
      if (!row) return null;
      return {
        id: Number(row.Product_ID),
        name: String(row.Product_Name || ''),
        lenderId: Number(row.Product_Lender_ID),
        borrowerId: row.Product_Borrower_ID == null ? null : Number(row.Product_Borrower_ID),
        isActive: Number(row.Product_Is_Active) === 1,
        currentTransactionStatus: String(row.Current_Transaction_Status || ''),
        description: String(row.Product_Description || ''),
        condition: String(row.Product_Condition || 'Good'),
        imageUrl: String(row.Product_Url || ''),
        lendingCharge: Number(row.Product_Lending_Charge) || 0
      };
    },
    async listImages(productId) {
      const rows = await productModel.listProductImages(productId);
      return rows.map((row: any) => ({
        id: Number(row.id),
        url: String(row.image_url || ''),
        sortOrder: Number(row.sort_order) || 0,
        isCover: Boolean(row.is_cover)
      }));
    }
  };
}