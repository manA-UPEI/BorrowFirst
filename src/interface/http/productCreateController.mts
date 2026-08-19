import { createProductUseCase } from '../../application/products/createProduct.mjs';
import {
  createLegacyImageStorage,
  createLegacyProductValidator,
  createLegacyProductWriter,
  createLegacyTransactionRunner
} from '../../infrastructure/products/legacyProductCreationDependencies.mjs';

const createProduct = createProductUseCase(
  createLegacyProductValidator(),
  createLegacyProductWriter(),
  createLegacyImageStorage(),
  createLegacyTransactionRunner()
);

export async function createProductHandler(request: any, response: any): Promise<void> {
  try {
    const productId = await createProduct.execute({
      lenderId: Number(request.session.userId),
      fields: {
        name: request.body.name,
        description: request.body.description,
        condition: request.body.condition,
        price: request.body.price,
        imageUrl: request.body.imageUrl
      },
      coverIndex: request.body.coverIndex,
      files: (Array.isArray(request.files) ? request.files : []).map((file: any) => ({
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname
      }))
    });

    response.json({ success: true, id: productId });
  } catch (error: any) {
    response.status(error.statusCode || 500).json({
      message: error.message || 'Unable to add item.'
    });
  }
}