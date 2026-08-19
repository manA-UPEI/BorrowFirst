import { createPickupOptionsUseCase } from '../../application/products/pickupOptions.mjs';
import { createLegacyPickupOptionRepository } from '../../infrastructure/products/legacyPickupOptionRepository.mjs';

const getPickupOptions = createPickupOptionsUseCase(createLegacyPickupOptionRepository());

export async function pickupOptionsHandler(request: any, response: any): Promise<void> {
  try {
    const options = await getPickupOptions.execute(Number(request.params.productId));
    response.json(options);
  } catch (error: any) {
    response.status(error.statusCode || 500).json({ message: error.message || 'Unable to load pickup options.' });
  }
}