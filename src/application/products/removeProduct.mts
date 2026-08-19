import type { ImageStorage } from '../ports/imageStorage.mjs';
import type { NotificationRepository } from '../ports/notificationRepository.mjs';
import type { ProductRemovalRepository } from '../ports/productRemovalRepository.mjs';

export class ProductRemovalError extends Error {
  constructor(public readonly statusCode: 400 | 403 | 404, message: string) {
    super(message);
    this.name = 'ProductRemovalError';
  }
}

export function createRemoveProductUseCase(
  products: ProductRemovalRepository,
  notifications: NotificationRepository,
  imageStorage: ImageStorage
) {
  return {
    async execute(productId: number, userId: number): Promise<{ alreadyRemoved?: boolean }> {
      if (!Number.isInteger(productId) || productId <= 0) {
        throw new ProductRemovalError(400, 'Invalid product');
      }

      const product = await products.findById(productId);

      if (!product) {
        throw new ProductRemovalError(404, 'Product not found');
      }

      if (product.lenderId !== userId) {
        throw new ProductRemovalError(403, 'Not allowed');
      }

      if (!product.isActive) {
        return { alreadyRemoved: true };
      }

      if (product.borrowerId !== null) {
        throw new ProductRemovalError(400, 'Items currently on loan cannot be removed from listings.');
      }

      await products.deactivate(productId);
      await notifications.rejectPendingForProduct(productId);

      const images = await products.listImages(productId);
      const deleted = await Promise.all(images.map((image) => (
        image.publicId ? imageStorage.deleteProductImage(image.publicId).catch(() => false) : true
      )));

      if (images.length && deleted.every(Boolean)) {
        await products.clearImages(productId);
      }

      return {};
    }
  };
}