import { createRequire } from 'node:module';
import {
  createGetAvailabilityUseCase,
  type AvailabilityRepository
} from '../../application/products/getAvailability.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const productModel = loadLegacyModule('../../../../server/models/productModel') as Record<string, any>;
const availabilityModel = loadLegacyModule('../../../../server/models/availabilityModel') as Record<string, any>;
const notificationModel = loadLegacyModule('../../../../server/models/notificationModel') as Record<string, any>;

function createLegacyAvailabilityRepository(): AvailabilityRepository {
  return {
    async existsActive(productId) {
      const product = await productModel.findById(productId);

      if (!product) {
        return null;
      }

      return Number(product.Product_Is_Active) === 1;
    },
    listWindows: availabilityModel.listWindows,
    listBookedRanges: (productId: number) => notificationModel.listBookedRanges(productId)
  };
}

const getAvailability = createGetAvailabilityUseCase(createLegacyAvailabilityRepository());

export async function availabilityHandler(request: any, response: any): Promise<void> {
  try {
    const view = await getAvailability.execute(Number(request.params.id));
    response.json(view);
  } catch (error: any) {
    response.status(error.statusCode || 500).json({
      message: error.message || 'Unable to load availability.'
    });
  }
}
