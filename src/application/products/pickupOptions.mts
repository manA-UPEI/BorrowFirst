import type { PickupProductRepository } from '../ports/pickupOptionRepository.mjs';

export class PickupOptionsError extends Error {
  constructor(public readonly statusCode: 400 | 404, message: string) {
    super(message);
    this.name = 'PickupOptionsError';
  }
}

export function createPickupOptionsUseCase(products: PickupProductRepository) {
  return {
    async execute(productId: number): Promise<readonly Record<string, unknown>[]> {
      if (!Number.isInteger(productId) || productId <= 0) {
        throw new PickupOptionsError(400, 'Invalid product');
      }

      const isActive = await products.existsActive(productId);

      if (isActive === null) {
        throw new PickupOptionsError(404, 'Product not found');
      }

      if (!isActive) {
        throw new PickupOptionsError(400, 'Listing is no longer available');
      }

      await products.ensureOptions(productId);
      return products.listOptions(productId);
    }
  };
}