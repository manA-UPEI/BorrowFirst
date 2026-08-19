import { createRemoveProductUseCase } from '../../application/products/removeProduct.mjs';
import { createLegacyImageStorage } from '../../infrastructure/products/legacyProductCreationDependencies.mjs';
import {
  createLegacyNotificationRepository,
  createLegacyProductRemovalRepository
} from '../../infrastructure/products/legacyProductRemovalDependencies.mjs';

const removeProduct = createRemoveProductUseCase(
  createLegacyProductRemovalRepository(),
  createLegacyNotificationRepository(),
  createLegacyImageStorage()
);

export async function removeProductHandler(request: any, response: any): Promise<void> {
  try {
    const result = await removeProduct.execute(Number(request.params.id), Number(request.session.userId));
    response.json({ success: true, ...result, ...(result.alreadyRemoved ? {} : { removed: true }) });
  } catch (error: any) {
    response.status(error.statusCode || 500).json({ message: error.message || 'Unable to remove item.' });
  }
}