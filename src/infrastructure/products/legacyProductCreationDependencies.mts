import { createRequire } from 'node:module';
import type { ImageStorage } from '../../application/ports/imageStorage.mjs';
import type { ProductValidator } from '../../application/products/createProduct.mjs';
import type { ProductWriter } from '../../application/ports/productWriter.mjs';
import type { TransactionRunner } from '../../application/ports/transactionRunner.mjs';

const loadLegacyModule = createRequire(import.meta.url);
const productModel = loadLegacyModule('../../../../server/models/productModel') as Record<string, any>;
const availabilityModel = loadLegacyModule('../../../../server/models/availabilityModel') as Record<string, any>;
const imageService = loadLegacyModule('../../../../server/services/imageService') as Record<string, any>;
const imageStorage = loadLegacyModule('../../../../server/services/productImageStorage') as Record<string, any>;
const validationService = loadLegacyModule('../../../../server/services/validationService') as Record<string, any>;
const connection = loadLegacyModule('../../../../server/db/connection') as Record<string, any>;

export function createLegacyProductWriter(): ProductWriter {
  return {
    createProduct: productModel.createProduct,
    async addProductImage(input) {
      await productModel.addProductImage({
        productId: input.productId,
        cloudinaryPublicId: input.asset.publicId,
        imageUrl: input.asset.url,
        sortOrder: input.sortOrder,
        isCover: input.isCover,
        width: input.asset.width,
        height: input.asset.height,
        bytes: input.asset.bytes,
        mimeType: input.asset.mimeType
      });
    },
    updateCoverImage: productModel.updateCoverImage,
    replacePickupOptions: productModel.replacePickupOptions,
    replaceAvailability: availabilityModel.replaceWindows
  };
}

export function createLegacyImageStorage(): ImageStorage {
  return {
    uploadProductImage: (file, input) => imageStorage.uploadProductImage(file.buffer, {
      mimeType: file.mimeType,
      originalName: file.originalName,
      ...input
    }),
    deleteProductImage: imageStorage.deleteProductImage
  };
}

export function createLegacyProductValidator(): ProductValidator {
  return {
    validateFields: validationService.getValidatedProductFields,
    validateCoverIndex: validationService.getValidatedProductCoverIndex,
    validatePickupWindows: validationService.getValidatedPickupWindows,
    validateAvailability: validationService.getValidatedAvailability
  };
}

export function createLegacyTransactionRunner(): TransactionRunner {
  return { run: connection.withTransaction };
}

export const DEFAULT_PRODUCT_IMAGE = imageService.DEFAULT_PRODUCT_IMAGE as string;