import { createRequire } from 'node:module';
import type { NotificationRepository } from '../../application/ports/notificationRepository.mjs';
import type { ProductRemovalRepository } from '../../application/ports/productRemovalRepository.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const productModel = loadLegacyModule('../../../../server/models/productModel') as Record<string, any>;
const notificationModel = loadLegacyModule('../../../../server/models/notificationModel') as Record<string, any>;

export function createLegacyProductRemovalRepository(): ProductRemovalRepository {
  return {
    async findById(productId) {
      const product = await productModel.findById(productId);
      return product ? {
        lenderId: Number(product.Product_Lender_ID),
        borrowerId: product.Product_Borrower_ID == null ? null : Number(product.Product_Borrower_ID),
        isActive: Number(product.Product_Is_Active) === 1
      } : null;
    },
    deactivate: productModel.deactivateProduct,
    async listImages(productId) {
      const images = await productModel.listProductImages(productId);
      return images.map((image: any) => ({ publicId: image.cloudinary_public_id || '' }));
    },
    clearImages: productModel.clearProductImages
  };
}

export function createLegacyNotificationRepository(): NotificationRepository {
  return { rejectPendingForProduct: notificationModel.rejectPendingForProduct };
}