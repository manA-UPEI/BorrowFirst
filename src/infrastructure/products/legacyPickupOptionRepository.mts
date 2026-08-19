import { createRequire } from 'node:module';
import type { PickupProductRepository } from '../../application/ports/pickupOptionRepository.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const productModel = loadLegacyModule('../../../../server/models/productModel') as Record<string, any>;

export function createLegacyPickupOptionRepository(): PickupProductRepository {
  return {
    async existsActive(productId) {
      const product = await productModel.findById(productId);
      if (!product) return null;
      return Number(product.Product_Is_Active) === 1;
    },
    ensureOptions: productModel.ensurePickupOptions,
    listOptions: productModel.listPickupOptions
  };
}