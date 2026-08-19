import type { ProductImageAsset } from './productWriter.mjs';

export interface ProductImageFile {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly originalName: string;
}

export interface ImageStorage {
  uploadProductImage(file: ProductImageFile, input: {
    productId: number;
    lenderId: number;
    sortOrder: number;
  }): Promise<ProductImageAsset>;
  deleteProductImage(publicId: string): Promise<boolean>;
}